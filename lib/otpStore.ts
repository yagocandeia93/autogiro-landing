import { randomInt } from "node:crypto";
import { Redis } from "@upstash/redis";

// "Sala de espera": guarda o lead (ainda não é cliente, só uma intenção)
// junto com o OTP, por 15 minutos. Nada disso toca o banco do AutoGiro —
// de propósito, ver README. Mesmo fallback em memória dos outros arquivos
// para não travar o dev local sem Upstash configurado.

export interface PendingLead {
  nome: string;
  email: string;
  whatsapp: string;
  plan: "BASICO" | "PRO";
  otp: string;
  attempts: number;
  createdAt: number;
}

export interface VerifiedLead {
  nome: string;
  email: string;
  whatsapp: string;
  plan: "BASICO" | "PRO";
  verifiedAt: number;
}

const OTP_TTL_SECONDS = 15 * 60;
const VERIFIED_TTL_SECONDS = 30 * 60;

function otpKey(email: string) {
  return `autogiro-landing:signup-otp:${email.toLowerCase()}`;
}
function verifiedKey(email: string) {
  return `autogiro-landing:verified-lead:${email.toLowerCase()}`;
}

let redisClient: Redis | null | undefined;

/** `undefined` = ainda não checou; `null` = Upstash não configurado (usa memória). */
function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN ausentes em produção. " +
          "O Muro 2 (OTP) depende do Redis para guardar o código com expiração — " +
          "sem ele não tem onde armazenar a sala de espera."
      );
    }
    console.warn(
      "[otpStore] Upstash não configurado — usando armazenamento em memória (só para dev local)."
    );
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

// Fallback local: Map com expiração checada na leitura (sem setTimeout, pra
// não vazar timers vivos entre requisições serverless).
const memPending = new Map<string, { value: PendingLead; expiresAt: number }>();
const memVerified = new Map<string, { value: VerifiedLead; expiresAt: number }>();

export async function savePendingLead(lead: PendingLead): Promise<void> {
  const redis = getRedis();
  const key = otpKey(lead.email);
  if (redis) {
    await redis.set(key, lead, { ex: OTP_TTL_SECONDS });
  } else {
    memPending.set(key, {
      value: lead,
      expiresAt: Date.now() + OTP_TTL_SECONDS * 1000,
    });
  }
}

export async function getPendingLead(email: string): Promise<PendingLead | null> {
  const redis = getRedis();
  const key = otpKey(email);
  if (redis) {
    return (await redis.get<PendingLead>(key)) ?? null;
  }
  const entry = memPending.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    memPending.delete(key);
    return null;
  }
  return entry.value;
}

export async function incrementPendingAttempts(email: string, lead: PendingLead): Promise<void> {
  const redis = getRedis();
  const key = otpKey(email);
  const updated = { ...lead, attempts: lead.attempts + 1 };
  if (redis) {
    // Mantém o TTL restante em vez de reiniciar os 15 min a cada tentativa.
    const ttl = await redis.ttl(key);
    await redis.set(key, updated, { ex: ttl > 0 ? ttl : OTP_TTL_SECONDS });
  } else {
    const entry = memPending.get(key);
    memPending.set(key, {
      value: updated,
      expiresAt: entry?.expiresAt ?? Date.now() + OTP_TTL_SECONDS * 1000,
    });
  }
}

export async function deletePendingLead(email: string): Promise<void> {
  const redis = getRedis();
  const key = otpKey(email);
  if (redis) {
    await redis.del(key);
  } else {
    memPending.delete(key);
  }
}

export async function saveVerifiedLead(lead: VerifiedLead): Promise<void> {
  const redis = getRedis();
  const key = verifiedKey(lead.email);
  if (redis) {
    await redis.set(key, lead, { ex: VERIFIED_TTL_SECONDS });
  } else {
    memVerified.set(key, {
      value: lead,
      expiresAt: Date.now() + VERIFIED_TTL_SECONDS * 1000,
    });
  }
}

/**
 * Lido pelo webhook do gateway (Muro 1) para recuperar quem pagou — a
 * checkout stub usa o e-mail como `external_reference`, então o webhook
 * consulta por e-mail de volta. Se o registro já expirou (>30 min desde a
 * verificação do OTP sem completar o pagamento), o webhook não tem pra
 * quem provisionar e precisa tratar isso explicitamente.
 */
export async function getVerifiedLead(email: string): Promise<VerifiedLead | null> {
  const redis = getRedis();
  const key = verifiedKey(email);
  if (redis) {
    return (await redis.get<VerifiedLead>(key)) ?? null;
  }
  const entry = memVerified.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    memVerified.delete(key);
    return null;
  }
  return entry.value;
}

const PROCESSED_EVENT_TTL_SECONDS = 24 * 60 * 60;
const memProcessedEvents = new Map<string, number>();

function processedEventKey(eventId: string) {
  return `autogiro-landing:webhook-processed:${eventId}`;
}

/**
 * Idempotência do webhook: gateways de pagamento reenviam o mesmo evento
 * (timeout na resposta, retry automático, etc.) — sem isso, um retry
 * dispararia o provisionamento da loja e o e-mail de "acesso liberado" DUAS
 * vezes. Retorna `true` na primeira vez que vê o evento (deve processar) e
 * `false` nas seguintes (já processado, ignorar).
 */
export async function claimWebhookEvent(eventId: string): Promise<boolean> {
  const redis = getRedis();
  const key = processedEventKey(eventId);
  if (redis) {
    // NX: só grava se a chave não existir — operação atômica, sem race
    // condition entre "checar" e "gravar" se dois webhooks chegarem juntos.
    const result = await redis.set(key, Date.now(), {
      ex: PROCESSED_EVENT_TTL_SECONDS,
      nx: true,
    });
    return result === "OK";
  }
  if (memProcessedEvents.has(key)) return false;
  memProcessedEvents.set(key, Date.now());
  return true;
}

/**
 * Gera um OTP numérico de 6 dígitos (000000–999999), com zeros à esquerda.
 * `randomInt` (node:crypto) em vez de `Math.random()` — é um código que
 * protege a conta, não um sorteio de UI; vale usar o gerador criptográfico.
 */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
