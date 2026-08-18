import { Redis } from "@upstash/redis";

// Registro durável do lead que pediu para assinar. Nada disso toca o banco do
// AutoGiro — de propósito, ver README. Mesmo fallback em memória dos outros
// arquivos para não travar o dev local sem Upstash configurado.
//
// Este arquivo era `lib/otpStore.ts`: guardava, além do lead, um código de 6
// dígitos e o contador de tentativas de uma "sala de espera" de 15 minutos.
// O código por e-mail saiu do funil (ver app/api/signup-intent/route.ts), e
// com ele foram embora `PendingLead`, `generateOtp` e as funções de tentativa.
// O que sobrou é o que o Muro 1 (gateway de pagamento) ainda vai precisar:
// achar, a partir do e-mail que o gateway devolve, quem foi que pagou.

export interface SignupLead {
  nome: string;
  email: string;
  whatsapp: string;
  loja: string;
  plan: "BASICO" | "PRO";
  createdAt: number;
}

/**
 * 7 dias. Antes eram 24 h, medidas a partir da verificação do e-mail: a pessoa
 * confirmava o código e caía direto no checkout, então o pagamento vinha na
 * mesma sessão ou na manhã seguinte. Sem o código, o funil termina com um
 * consultor entrando em contato em até 1 dia útil — a cobrança só existe
 * depois dessa conversa, e uma janela de 24 h expiraria o registro antes de o
 * primeiro contato acontecer.
 */
const LEAD_TTL_SECONDS = 7 * 24 * 60 * 60;

function leadKey(email: string) {
  return `autogiro-landing:signup-lead:${email.toLowerCase()}`;
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
          "O webhook de pagamento depende do Redis para achar de volta quem " +
          "pagou — sem ele não tem onde guardar o lead."
      );
    }
    console.warn(
      "[leadStore] Upstash não configurado — usando armazenamento em memória (só para dev local)."
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
// bundle próprio, então `signup-intent` e `webhooks/payment` teriam cada uma o
// SEU armazenamento, e testar o webhook localmente seria impossível — o lead
// gravado por uma rota nunca seria encontrado pela outra. Também sobrevive ao
// hot reload. Em produção nada disso é usado: lá o Redis é obrigatório
// (getRedis lança sem as variáveis).
interface MemStore {
  leads: Map<string, { value: SignupLead; expiresAt: number }>;
  processedEvents: Map<string, number>;
}

const globalForMem = globalThis as typeof globalThis & {
  __autogiroMemStore?: MemStore;
};

const mem: MemStore = (globalForMem.__autogiroMemStore ??= {
  leads: new Map(),
  processedEvents: new Map(),
});

export async function saveSignupLead(lead: SignupLead): Promise<void> {
  const redis = getRedis();
  const key = leadKey(lead.email);
  if (redis) {
    await redis.set(key, lead, { ex: LEAD_TTL_SECONDS });
  } else {
    mem.leads.set(key, {
      value: lead,
      expiresAt: Date.now() + LEAD_TTL_SECONDS * 1000,
    });
  }
}

/**
 * Lido pelo webhook do gateway (Muro 1) para recuperar quem pagou — a
 * checkout stub usa o e-mail como `external_reference`, então o webhook
 * consulta por e-mail de volta. Se o registro já expirou, o webhook não tem
 * pra quem provisionar e precisa tratar isso explicitamente.
 */
export async function getSignupLead(email: string): Promise<SignupLead | null> {
  const redis = getRedis();
  const key = leadKey(email);
  if (redis) {
    return (await redis.get<SignupLead>(key)) ?? null;
  }
  const entry = mem.leads.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    mem.leads.delete(key);
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
