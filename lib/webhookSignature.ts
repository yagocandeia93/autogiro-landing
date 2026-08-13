import { createHmac, timingSafeEqual } from "node:crypto";

// A escolha do gateway (Asaas vs Pagar.me) ainda não foi feita — fica pra
// sexta. Os dois autenticam webhook de jeitos DIFERENTES, não dá pra fingir
// que são a mesma coisa por baixo de uma função genérica só de HMAC:
//
//   Asaas:    header "asaas-access-token" com um token ESTÁTICO que você
//             mesmo cadastra no painel; o Asaas devolve esse token exato a
//             cada webhook. Não é HMAC, é comparação direta (mas ainda
//             timing-safe — não dá pra usar `===` num segredo).
//   Pagar.me: header "x-hub-signature" (prefixo "sha256=") com HMAC-SHA256
//             de verdade sobre o corpo cru, calculado com a signing key da
//             conta.
//
// `verifyPaymentWebhook` escolhe qual dos dois rodar via PAYMENT_GATEWAY.

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyAsaasToken(headerValue: string | null, secret: string): boolean {
  if (!headerValue) return false;
  return timingSafeStringEqual(headerValue, secret);
}

function verifyPagarmeHmac(
  rawBody: string,
  headerValue: string | null,
  secret: string
): boolean {
  if (!headerValue) return false;
  const received = headerValue.startsWith("sha256=")
    ? headerValue.slice("sha256=".length)
    : headerValue;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeStringEqual(expected, received);
}

export type PaymentGateway = "asaas" | "pagarme";

export function currentGateway(): PaymentGateway {
  return process.env.PAYMENT_GATEWAY === "pagarme" ? "pagarme" : "asaas";
}

/** Nome do header a ler da requisição — depende do gateway configurado. */
export function webhookSignatureHeaderName(gateway: PaymentGateway): string {
  return gateway === "pagarme" ? "x-hub-signature" : "asaas-access-token";
}

/**
 * Verifica a autenticidade do webhook. `rawBody` precisa ser o texto EXATO
 * recebido (antes de qualquer JSON.parse) — no caso do Pagar.me, o HMAC é
 * calculado sobre os bytes crus; reserializar o JSON parseado pode dar um
 * hash diferente do que o gateway calculou (ordem de chaves, espaçamento).
 */
export function verifyPaymentWebhook(
  gateway: PaymentGateway,
  rawBody: string,
  headerValue: string | null,
  secret: string
): boolean {
  if (!secret) return false;
  return gateway === "pagarme"
    ? verifyPagarmeHmac(rawBody, headerValue, secret)
    : verifyAsaasToken(headerValue, secret);
}
