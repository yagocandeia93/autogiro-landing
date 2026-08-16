import { NextRequest, NextResponse } from "next/server";
import { getSignupRateLimiter, clientIp } from "@/lib/rateLimit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { generateOtp, savePendingLead } from "@/lib/otpStore";
import { sendOtpEmail, notifyNewLead } from "@/lib/resend";

// Rota de "intenção de cadastro" — Muro 3 (anti-abuso) + Muro 2 (OTP por
// e-mail) isolados do Muro 1 (gateway de pagamento), que ainda não existe.
// Passa daqui pra "sala de espera" no Redis (lib/otpStore.ts): nome, e-mail,
// WhatsApp, plano e o OTP ficam guardados por 15 min. NÃO cria tenant nem
// cobra ninguém — ver README.md para o que falta.
//
// A rota atende DOIS fluxos, que dividem o Muro 3 mas divergem depois:
//
//   origem=plano         → botões de assinatura, vindos de /inscricao.
//                          Segue o caminho completo: OTP + sala de espera.
//   origem=demonstracao  → modal de "Agendar demonstração" da landing.
//                          Só pede retorno de um consultor, então NÃO gera
//                          OTP: mandar "seu código de verificação" para quem
//                          pediu uma ligação é confuso, e não há cadastro para
//                          confirmar. O aviso para a equipe é o entregável, e
//                          é ele que virou o registro durável desse lead.

interface SignupIntentBody {
  nome?: string;
  email?: string;
  whatsapp?: string;
  /** Nome da loja — obrigatório no fluxo de demonstração. */
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
  // Só "demonstracao" abre o caminho curto; qualquer outro valor (ausente ou
  // forjado) cai no fluxo de plano, que é o mais restritivo dos dois.
  const isDemo = body.origem === "demonstracao";

  const plan = parsePlan(body.plan);
  const camposBase =
    nome.length >= 2 && EMAIL_RE.test(email) && isValidBRPhone(whatsapp);
  // Demonstração exige a loja e ignora plano; assinatura exige plano e aceita
  // loja como opcional (o formulário de /inscricao ainda não pergunta isso).
  const camposOk = isDemo
    ? camposBase && loja.length >= 2
    : camposBase && plan !== null;

  if (!camposOk) {
    return NextResponse.json(
      {
        error: "missing_fields",
        message: isDemo
          ? "Confira nome, e-mail, WhatsApp e o nome da loja antes de continuar."
          : "Confira nome, e-mail, WhatsApp e plano antes de continuar.",
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

  // ── Fluxo de demonstração: termina aqui ────────────────────────────────
  // Sem OTP e sem sala de espera. Não existe cadastro para confirmar, então o
  // aviso para a equipe é o único e o mais importante efeito da requisição —
  // por isso, e só aqui, uma falha nele vira erro para quem enviou: se
  // ninguém foi avisado, o pedido de demonstração simplesmente não existe.
  if (isDemo) {
    const avisado = await notifyNewLead({
      nome,
      email,
      whatsapp,
      loja,
      origem: "demonstracao",
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
      message: "Pedido recebido! Um consultor entra em contato em até 1 dia útil.",
    });
  }

  // ── Fluxo de assinatura: segue para o Muro 2 ───────────────────────────
  if (!plan) {
    // Inalcançável: `camposOk` acima já rejeitou plano inválido fora do fluxo
    // de demonstração. O guard existe porque o TypeScript não acompanha uma
    // validação feita através de variável booleana, e é melhor reafirmar aqui
    // do que assertar o tipo à força.
    return NextResponse.json(
      {
        error: "missing_fields",
        message: "Confira nome, e-mail, WhatsApp e plano antes de continuar.",
      },
      { status: 400 }
    );
  }

  // Venceu os Muros 3 (Turnstile + rate limit) e os campos batem — abre o
  // Muro 2: gera o OTP, guarda o lead na sala de espera por 15 min, dispara
  // o e-mail. Se o Resend falhar, o lead FICA salvo (não se perde o dado só
  // porque o e-mail não saiu) mas a resposta é de erro, porque sem o e-mail
  // a pessoa não tem como avançar.
  const otp = generateOtp();

  await savePendingLead({
    nome,
    email,
    whatsapp,
    plan,
    otp,
    attempts: 0,
    createdAt: Date.now(),
  });

  try {
    await sendOtpEmail(email, nome, otp);
  } catch (err) {
    console.error("[signup-intent] falha ao enviar e-mail de OTP:", err);
    return NextResponse.json(
      {
        error: "email_send_failed",
        message:
          "Não conseguimos enviar o e-mail de verificação agora. Tente novamente em instantes.",
      },
      { status: 502 }
    );
  }

  // Lead válido e a caminho do OTP: avisa a equipe agora, não depois do
  // código confirmado. Quem desiste na tela do OTP é justamente o lead que
  // vale uma ligação, e sem este aviso ele sumia junto com o TTL do Redis.
  // `notifyNewLead` não lança — o cadastro não pode falhar por causa do
  // e-mail interno —, mas o await garante que o envio termine antes da
  // função serverless ser congelada.
  await notifyNewLead({
    nome,
    email,
    whatsapp,
    loja: loja || undefined,
    plan,
    origem: "plano",
  });

  // TODO (Muro 1 — gateway de cobrança): entra depois que /api/verify-otp
  // confirmar o código, não aqui.
  return NextResponse.json({
    ok: true,
    stage: "otp",
    remaining,
    message: "Código enviado! Confira seu e-mail.",
  });
}
