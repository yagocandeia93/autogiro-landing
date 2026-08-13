const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileVerifyResult {
  ok: boolean;
  errorCodes?: string[];
}

/**
 * Verifica o token do Cloudflare Turnstile no servidor. NUNCA confie no
 * "sucesso" reportado pelo widget no navegador sozinho — é só client-side,
 * um bot pode simplesmente não carregar o widget e chamar a API direto. A
 * verificação real é sempre este POST server-to-server com a secret key.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp: string
): Promise<TurnstileVerifyResult> {
  if (!token) {
    return { ok: false, errorCodes: ["missing-token"] };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TURNSTILE_SECRET_KEY ausente em produção. Sem ela, a verificação do " +
          "Turnstile não roda e qualquer requisição passaria como humana."
      );
    }
    console.warn(
      "[turnstile] TURNSTILE_SECRET_KEY não configurada — aceitando qualquer token em dev."
    );
    return { ok: true };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  body.set("remoteip", remoteIp);

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    return { ok: false, errorCodes: [`http-${res.status}`] };
  }

  const data = (await res.json()) as {
    success: boolean;
    "error-codes"?: string[];
  };

  return { ok: data.success, errorCodes: data["error-codes"] };
}
