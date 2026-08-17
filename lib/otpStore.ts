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
  /** Nome da loja — agora obrigatório nos dois funis (modal e /inscricao). */
  loja: string;
  plan: "BASICO" | "PRO";
  otp: string;
  attempts: number;
  createdAt: number;
}

export interface VerifiedLead {
  nome: string;
  email: string;
  whatsapp: string;
  loja: string;
  plan: "BASICO" | "PRO";
  verifiedAt: number;
}

const OTP_TTL_SECONDS = 15 * 60;

/**
 * 24 h, e não os 30 min originais. A janela precisa cobrir o tempo real entre
 * verificar o e-mail e o pagamento cair: PIX gerado à noite costuma ser pago na
 * manhã seguinte, e cartão recusado quase sempre tem nova tentativa manual
 * horas depois. Com 30 min, o webhook de pagamento chegava sem achar o
 * `verified-lead` e a pessoa **que já tinha pago** era descartada em silêncio.
 */
const VERIFIED_TTL_SECONDS = 24 * 60 * 60;

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
//
// Preso ao `globalThis`, não ao módulo: em dev o Next compila cada rota em um
// bundle próprio, então `signup-intent` e `verify-otp` teriam cada uma a SUA
// sala de espera e o fluxo de OTP ficaria impossível de testar sem Upstash —
// o código enviado por uma rota nunca seria encontrado pela outra. Também
// sobrevive ao hot reload. Em produção nada disso é usado: lá o Redis é
// obrigatório (getRedis lança sem as variáveis).
interface MemStore {
  pending: Map<string, { value: PendingLead; expiresAt: number }>;
  verified: Map<string, { value: VerifiedLead; expiresAt: number }>;
  processedEvents: Map<string, number>;
}

const globalForMem = globalThis as typeof globalThis & {
  __autogiroMemStore?: MemStore;
};

const mem: MemStore = (globalForMem.__autogiroMemStore ??= {
  pending: new Map(),
  verified: new Map(),
  processedEvents: new Map(),
});

export async function savePendingLead(lead: PendingLead): Promise<void> {
  const redis = getRedis();
  const key = otpKey(lead.email);
  if (redis) {
    await redis.set(key, lead, { ex: OTP_TTL_SECONDS });
  } else {
    mem.pending.set(key, {
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
  const entry = mem.pending.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    mem.pending.delete(key);
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
    const entry = mem.pending.get(key);
    mem.pending.set(key, {
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
    mem.pending.delete(key);
  }
}

export async function saveVerifiedLead(lead: VerifiedLead): Promise<void> {
  const redis = getRedis();
  const key = verifiedKey(lead.email);
  if (redis) {
    await redis.set(key, lead, { ex: VERIFIED_TTL_SECONDS });
  } else {
    mem.verified.set(key, {
      value: lead,
      expiresAt: Date.now() + VERIFIED_TTL_SECONDS * 1000,
    });
  }
}

/**
 * Lido pelo webhook do gateway (Muro 1) para recuperar quem pagou — a
 * checkout stub usa o e-mail como `external_reference`, então o webhook
 * consulta por e-mail de volta. Se o registro já expirou (>24 h desde a
 * verificação do OTP sem completar o pagamento), o webhook não tem pra
 * quem provisionar e precisa tratar isso explicitamente.
 */
export async function getVerifiedLead(email: string): Promise<VerifiedLead | null> {
  const redis = getRedis();
  const key = verifiedKey(email);
  if (redis) {
    return (await redis.get<VerifiedLead>(key)) ?? null;
  }
  const entry = mem.verified.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    mem.verified.delete(key);
    return null;
  }
  return entry.value;
}

const PROCESSED_EVENT_TTL_SECONDS = 24 * 60 * 60;

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
  if (mem.processedEvents.has(key)) return false;
  mem.processedEvents.set(key, Date.now());
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
