import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Padrão "mock por padrão via .env", igual ao AutoGiro DMS principal: sem
// UPSTASH_REDIS_REST_URL/TOKEN configurados (dev local), cai num limitador em
// memória. Isso NÃO é seguro em produção multi-instância (cada instância da
// Vercel teria seu próprio contador) — é só para não travar o `npm run dev`.
// Em produção, as variáveis são obrigatórias e o build falha sem elas.

class InMemoryRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private maxAttempts: number,
    private windowMs: number
  ) {}

  async limit(key: string) {
    const now = Date.now();
    const attempts = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.windowMs
    );
    const success = attempts.length < this.maxAttempts;
    if (success) {
      attempts.push(now);
      this.hits.set(key, attempts);
    }
    const oldestInWindow = attempts[0] ?? now;
    return {
      success,
      limit: this.maxAttempts,
      remaining: Math.max(0, this.maxAttempts - attempts.length),
      reset: oldestInWindow + this.windowMs,
    };
  }
}

const limiterCache = new Map<string, Ratelimit | InMemoryRateLimiter>();

/**
 * Fábrica genérica de rate limiter, com um prefixo próprio por rota (cada
 * rota tem seu próprio contador — tentativas de OTP não competem com
 * tentativas de signup-intent). `windowLabel` é o formato do Upstash
 * ("10 m", "15 m"); `windowMs` é o mesmo período em ms, pro fallback local.
 */
function getLimiter(
  prefix: string,
  maxAttempts: number,
  windowLabel: `${number} ${"ms" | "s" | "m" | "h" | "d"}`,
  windowMs: number
) {
  const cached = limiterCache.get(prefix);
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  let limiter: Ratelimit | InMemoryRateLimiter;

  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN ausentes em produção. " +
          "Configure o Upstash Redis antes do deploy — sem isso o rate limit " +
          "não é confiável entre instâncias serverless."
      );
    }
    console.warn(
      `[rateLimit:${prefix}] Upstash não configurado — usando limitador em memória (só para dev local).`
    );
    limiter = new InMemoryRateLimiter(maxAttempts, windowMs);
  } else {
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(maxAttempts, windowLabel),
      prefix: `autogiro-landing:${prefix}`,
    });
  }

  limiterCache.set(prefix, limiter);
  return limiter;
}

/** 3 tentativas / 10 min / IP — envio dos dados iniciais (nome, e-mail, WhatsApp). */
export function getSignupRateLimiter() {
  return getLimiter("signup-intent", 3, "10 m", 10 * 60 * 1000);
}

/**
 * 5 tentativas / 15 min / e-mail — validação do código OTP. Um código de 6
 * dígitos tem só 1 milhão de combinações; sem limitar tentativas aqui, o
 * Turnstile do passo anterior não impede alguém de tentar adivinhar o
 * código à vontade dentro da janela de 15 minutos em que ele vale.
 */
export function getOtpVerifyRateLimiter() {
  return getLimiter("verify-otp", 5, "15 m", 15 * 60 * 1000);
}

/** IP do cliente a partir dos headers que a Vercel injeta. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
