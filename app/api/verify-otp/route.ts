import { NextRequest, NextResponse } from "next/server";
import { getOtpVerifyRateLimiter, clientIp } from "@/lib/rateLimit";
import {
  getPendingLead,
  incrementPendingAttempts,
  deletePendingLead,
  saveVerifiedLead,
} from "@/lib/otpStore";
import { createCheckoutLink } from "@/lib/checkout";

interface VerifyOtpBody {
  email?: string;
  otp?: string;
}

const MAX_OTP_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);

  let body: VerifyOtpBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Requisição inválida." },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const otp = body.otp?.trim() ?? "";

  if (!email || !otp) {
    return NextResponse.json(
      { error: "missing_fields", message: "Informe o e-mail e o código recebido." },
      { status: 400 }
    );
  }

  // Rate limit por e-mail (o alvo do ataque de força bruta) E por IP — um
  // atacante trocando de e-mail-alvo a cada tentativa ainda esbarra no
  // limite por IP; alguém testando o próprio código várias vezes de IPs
  // diferentes (improvável, mas grátis de cobrir) esbarra no limite por
  // e-mail.
  const limiter = getOtpVerifyRateLimiter();
  const byEmail = await limiter.limit(`email:${email}`);
  const byIp = byEmail.success ? await limiter.limit(`ip:${ip}`) : byEmail;

  if (!byEmail.success || !byIp.success) {
    const reset = Math.min(byEmail.reset, byIp.reset);
    return NextResponse.json(
      {
        error: "rate_limited",
        message:
          "Muitas tentativas de código. Aguarde alguns minutos e solicite um novo.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(0, Math.ceil((reset - Date.now()) / 1000))),
        },
      }
    );
  }

  const lead = await getPendingLead(email);

  if (!lead) {
    return NextResponse.json(
      {
        error: "expired_or_not_found",
        message: "Código expirado ou não encontrado. Solicite um novo cadastro.",
      },
      { status: 400 }
    );
  }

  if (lead.attempts >= MAX_OTP_ATTEMPTS) {
    await deletePendingLead(email);
    return NextResponse.json(
      {
        error: "too_many_attempts",
        message: "Muitas tentativas erradas. Solicite um novo código.",
      },
      { status: 400 }
    );
  }

  if (lead.otp !== otp) {
    await incrementPendingAttempts(email, lead);
    const attemptsLeft = MAX_OTP_ATTEMPTS - (lead.attempts + 1);
    return NextResponse.json(
      {
        error: "invalid_otp",
        message:
          attemptsLeft > 0
            ? `Código incorreto. Você tem mais ${attemptsLeft} tentativa(s).`
            : "Código incorreto. Solicite um novo.",
      },
      { status: 400 }
    );
  }

  // Bateu. O lead "vence" o Muro 2: sai da sala de espera do OTP e vira um
  // lead verificado (TTL 30 min), pronto para o Muro 1 (checkout).
  await deletePendingLead(email);
  const verifiedLead = {
    nome: lead.nome,
    email: lead.email,
    whatsapp: lead.whatsapp,
    plan: lead.plan,
    verifiedAt: Date.now(),
  };
  await saveVerifiedLead(verifiedLead);

  const checkoutUrl = await createCheckoutLink(verifiedLead);

  return NextResponse.json({
    ok: true,
    message: "E-mail verificado!",
    checkoutUrl,
  });
}
