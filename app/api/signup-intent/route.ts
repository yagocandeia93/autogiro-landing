import { NextRequest, NextResponse } from "next/server";
import { getSignupRateLimiter, clientIp } from "@/lib/rateLimit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { saveSignupLead } from "@/lib/leadStore";
import { notifyNewLead } from "@/lib/resend";

// Rota única de captura de lead da landing. Recebe os dois funis do modal
// (public/lead-modal.js), que dividem os mesmos muros anti-abuso:
//
//   origem=plano         → "Assinar agora" (Básico) / "Começar agora" (Pro).
//                          Manda também o plano escolhido no botão.
//   origem=demonstracao  → CTAs de "Agendar demonstração".
//
// NÃO cria tenant nem cobra ninguém — ver README.md para o que falta.
//
// O que mudou: o funil de assinatura tinha um segundo muro, de verificação
// por e-mail. A rota gerava um código de 6 dígitos, guardava o lead numa
// "sala de espera" de 15 min no Redis e mandava o código; /api/verify-otp
// conferia o código e só então avisava a equipe pela segunda vez. Cada passo
// custava leads: sair da landing, esperar o e-mail, achar o código, voltar e
// digitar. O Turnstile (Muro 3) já é o que barra robô — o código servia para
// provar posse do e-mail, garantia que ninguém consumia, porque quem fecha a
// venda é um consultor pelo WhatsApp. Sem ele, o envio termina em um passo só.

interface SignupIntentBody {
  nome?: string;
  email?: string;
  whatsapp?: string;
  /** Nome da loja — obrigatório nos dois fluxos. */
  loja?: string;
  plan?: "BASICO" | "PRO";
  /** De onde o lead veio na landing: CTA de demonstração ou botão de plano. */
  origem?: string;
  turnstileToken?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidBRPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

function parsePlan(value: unknown): "BASICO" | "PRO" | null {
  return value === "BASICO" || value === "PRO" ? value : null;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  const limiter = getSignupRateLimiter();
  const { success, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((reset - Date.now()) / 1000)
    );
    return NextResponse.json(
      {
        error: "rate_limited",
        message:
          "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      }
    );
  }

  let body: SignupIntentBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Requisição inválida." },
      { status: 400 }
    );
  }

  // Valida os campos ANTES do Turnstile — não vale a pena gastar uma
  // chamada de verificação com o Cloudflare para uma requisição que já
  // está incompleta (o front-end já valida isso, mas o servidor nunca
  // confia só no front-end).
  const nome = body.nome?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const whatsapp = body.whatsapp ?? "";
  const loja = body.loja?.trim() ?? "";
  // Só "demonstracao" abre o caminho sem plano; qualquer outro valor (ausente
  // ou forjado) cai no fluxo de assinatura, que é o mais restritivo dos dois.
  const isDemo = body.origem === "demonstracao";

  const plan = parsePlan(body.plan);
  // Nome da loja é exigido nos DOIS fluxos, e o plano só no de assinatura —
  // quem pede demonstração não escolheu plano nenhum.
  const camposBase =
    nome.length >= 2 &&
    EMAIL_RE.test(email) &&
    isValidBRPhone(whatsapp) &&
    loja.length >= 2;
  const camposOk = isDemo ? camposBase : camposBase && plan !== null;

  if (!camposOk) {
    return NextResponse.json(
      {
        error: "missing_fields",
        message: isDemo
          ? "Confira nome, e-mail, WhatsApp e o nome da loja antes de continuar."
          : "Confira nome, e-mail, WhatsApp, o nome da loja e o plano antes de continuar.",
      },
      { status: 400 }
    );
  }

  const turnstile = await verifyTurnstileToken(body.turnstileToken, ip);
  if (!turnstile.ok) {
    return NextResponse.json(
      {
        error: "turnstile_failed",
        message:
          "Não conseguimos confirmar que você não é um robô. Atualize a página e tente novamente.",
      },
      { status: 400 }
    );
  }

  // Fluxo de assinatura: guarda o lead para o Muro 1 (gateway de pagamento).
  // É o registro que o webhook do gateway vai procurar pelo e-mail quando a
  // cobrança fechada pelo consultor for paga.
  //
  // A falha aqui NÃO derruba a resposta: o aviso para a equipe (abaixo) é o
  // que faz o lead existir na prática, e perder um lead quente porque o Redis
  // piscou seria trocar a conversão por um detalhe de infraestrutura.
  if (!isDemo && plan) {
    try {
      await saveSignupLead({
        nome,
        email,
        whatsapp,
        loja,
        plan,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error("[signup-intent] falha ao guardar o lead no Redis:", err);
    }
  }

  // O aviso para a equipe é o entregável dos dois fluxos: não existe mais
  // nenhuma etapa depois desta requisição, então se ninguém foi avisado, o
  // pedido simplesmente não aconteceu — daí ser o único ponto que pode
  // derrubar a resposta.
  const avisado = await notifyNewLead({
    nome,
    email,
    whatsapp,
    loja,
    plan: isDemo ? undefined : (plan ?? undefined),
    origem: isDemo ? "demonstracao" : "plano",
  });

  if (!avisado) {
    return NextResponse.json(
      {
        error: "notify_failed",
        message:
          "Não conseguimos registrar seu pedido agora. Tente novamente em instantes ou fale com a gente no WhatsApp.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    stage: "received",
    remaining,
    message: isDemo
      ? "Pedido recebido! Um consultor entra em contato em até 1 dia útil."
      : "Pedido recebido! Um consultor entra em contato em até 1 dia útil para ativar sua loja.",
  });
}
