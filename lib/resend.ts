import { Resend } from "resend";

let client: Resend | null | undefined;

function getClient(): Resend | null {
  if (client !== undefined) return client;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY ausente em produção. Sem ela, o Muro 2 gera o OTP mas " +
          "ninguém recebe o e-mail — pior que não ter o passo, porque a pessoa " +
          "fica travada sem saber por quê."
      );
    }
    client = null;
    return client;
  }

  client = new Resend(apiKey);
  return client;
}

function otpEmailHtml(nome: string, otp: string): string {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0e14; padding: 32px; color: #e9edf3;">
    <div style="max-width: 420px; margin: 0 auto; background: #111823; border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 32px;">
      <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #f5a524;">AutoGiro DMS</p>
      <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 700;">Falta pouco, ${escapeHtml(nome)}!</h1>
      <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #94a1b5;">
        Seu código de verificação para continuar o cadastro no AutoGiro DMS é:
      </p>
      <p style="margin: 0 0 24px; font-family: 'Geist Mono', monospace; font-size: 36px; font-weight: 700; letter-spacing: 0.12em; text-align: center; color: #f5a524;">
        ${otp}
      </p>
      <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #7c8899;">
        O código vale por 15 minutos. Se você não pediu isso, pode ignorar este e-mail.
      </p>
    </div>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendOtpEmail(
  to: string,
  nome: string,
  otp: string
): Promise<void> {
  const resend = getClient();

  if (!resend) {
    // Dev sem RESEND_API_KEY: imprime o código no console em vez de
    // enviar — é assim que se testa o fluxo do OTP localmente sem gastar
    // envio de e-mail de verdade.
    console.warn(
      `[resend] RESEND_API_KEY não configurada — OTP para ${to}: ${otp}`
    );
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error(
      "RESEND_FROM_EMAIL ausente. Precisa ser um remetente do domínio verificado no Resend."
    );
  }

  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Falta pouco para acessar o AutoGiro DMS!",
    html: otpEmailHtml(nome, otp),
  });

  if (error) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${error.message}`);
  }
}
