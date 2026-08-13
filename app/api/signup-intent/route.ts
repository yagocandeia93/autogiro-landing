import { NextRequest, NextResponse } from "next/server";
import { getSignupRateLimiter, clientIp } from "@/lib/rateLimit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { generateOtp, savePendingLead } from "@/lib/otpStore";
import { sendOtpEmail } from "@/lib/resend";

// Rota de "intenção de cadastro" — Muro 3 (anti-abuso) + Muro 2 (OTP por
// e-mail) isolados do Muro 1 (gateway de pagamento), que ainda não existe.
// Passa daqui pra "sala de espera" no Redis (lib/otpStore.ts): nome, e-mail,
// WhatsApp, plano e o OTP ficam guardados por 15 min. NÃO cria tenant nem
// cobra ninguém — ver README.md para o que falta.

interface SignupIntentBody {
  nome?: string;
  email?: string;
  whatsapp?: string;
  plan?: "BASICO" | "PRO";
  turnstileToken?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidBRPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
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

  if (
    nome.length < 2 ||
    !EMAIL_RE.test(email) ||
    !isValidBRPhone(whatsapp) ||
    (body.plan !== "BASICO" && body.plan !== "PRO")
  ) {
    return NextResponse.json(
      {
        error: "missing_fields",
        message: "Confira nome, e-mail, WhatsApp e plano antes de continuar.",
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
    plan: body.plan,
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

  // TODO (Muro 1 — gateway de cobrança): entra depois que /api/verify-otp
  // confirmar o código, não aqui.
  return NextResponse.json({
    ok: true,
    stage: "otp",
    remaining,
    message: "Código enviado! Confira seu e-mail.",
  });
}
