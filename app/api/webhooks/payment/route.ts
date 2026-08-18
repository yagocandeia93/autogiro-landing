import { NextRequest, NextResponse } from "next/server";
import {
  currentGateway,
  verifyPaymentWebhook,
  webhookSignatureHeaderName,
} from "@/lib/webhookSignature";
import { claimWebhookEvent, getSignupLead, type SignupLead } from "@/lib/leadStore";

// Ouvinte do gateway de pagamento (Asaas ou Pagar.me — ainda não escolhido,
// ver README). Esta é a única rota com permissão de considerar um lead
// "pago" e disparar o provisionamento — nenhum outro lugar do código toma
// essa decisão. O formato exato do payload depende do gateway escolhido
// sexta; a estrutura abaixo (verificar assinatura → checar evento → achar o
// lead → provisionar) não muda.

export async function POST(req: NextRequest) {
  // 1) Corpo CRU primeiro — a verificação de assinatura precisa dos bytes
  // exatos que o gateway enviou, não de um JSON reserializado.
  const rawBody = await req.text();

  const gateway = currentGateway();
  const secret =
    gateway === "pagarme"
      ? process.env.PAGARME_WEBHOOK_SECRET
      : process.env.ASAAS_WEBHOOK_SECRET;

  if (!secret) {
    // Sem segredo configurado, a rota não tem como distinguir o gateway
    // de um atacante. Falha fechada (rejeita tudo) em vez de aberta.
    console.error(
      `[webhooks/payment] ${gateway === "pagarme" ? "PAGARME_WEBHOOK_SECRET" : "ASAAS_WEBHOOK_SECRET"} não configurado — recusando webhook.`
    );
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const headerName = webhookSignatureHeaderName(gateway);
  const signatureHeader = req.headers.get(headerName);

  const isAuthentic = verifyPaymentWebhook(gateway, rawBody, signatureHeader, secret);
  if (!isAuthentic) {
    // Não logar o rawBody/headers aqui — podem conter dado de cliente, e um
    // webhook falso é, por definição, não confiável.
    console.warn("[webhooks/payment] assinatura inválida — requisição rejeitada.");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 2) Formato de evento — placeholder até o gateway ser escolhido. Cada
  // gateway usa nomes de evento e caminho de campos diferentes:
  //   Asaas:    payload.event === "PAYMENT_CONFIRMED" | "PAYMENT_RECEIVED"
  //             payload.payment.externalReference, payload.payment.id
  //   Pagar.me: payload.type === "charge.paid"
  //             payload.data.metadata.external_reference, payload.id
  const eventId = extractEventId(gateway, payload);
  const eventType = extractEventType(gateway, payload);
  const externalReference = extractExternalReference(gateway, payload);

  if (!eventId || !eventType || !externalReference) {
    console.error(
      "[webhooks/payment] payload sem eventId/eventType/externalReference — formato ainda não implementado para",
      gateway
    );
    return NextResponse.json({ error: "unrecognized_payload" }, { status: 400 });
  }

  // 3) Idempotência — gateways reenviam o mesmo evento em retry. Sem isso,
  // um retry provisionaria a loja (e mandaria o e-mail de acesso) de novo.
  const isFirstDelivery = await claimWebhookEvent(eventId);
  if (!isFirstDelivery) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const isPaidEvent = isPaymentConfirmedEvent(gateway, eventType);
  if (!isPaidEvent) {
    // Gateway manda outros eventos também (falha, estorno, boleto vencido).
    // Só o de confirmação dispara o gatilho final — os outros só confirmam
    // recebimento pra não virar retry infinito no painel do gateway.
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const lead = await getSignupLead(externalReference);
  if (!lead) {
    // O signup-lead expira em 7 dias. Se o consultor demorar mais que isso
    // para fechar a venda, o webhook chega sem achar quem provisionar. Isso é
    // motivo de alerta operacional — não um 500: o webhook está correto, o
    // dado que faltava expirou. Ver README ("TTL curto demais?").
    console.error(
      `[webhooks/payment] pagamento confirmado sem signup-lead correspondente: ${externalReference}`
    );
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  await triggerProvisioning(lead, eventId);

  return NextResponse.json({ ok: true });
}

function extractEventId(gateway: string, payload: Record<string, unknown>): string | null {
  if (gateway === "pagarme") {
    return typeof payload.id === "string" ? payload.id : null;
  }
  const payment = payload.payment as Record<string, unknown> | undefined;
  return typeof payment?.id === "string" ? payment.id : null;
}

function extractEventType(gateway: string, payload: Record<string, unknown>): string | null {
  const field = gateway === "pagarme" ? payload.type : payload.event;
  return typeof field === "string" ? field : null;
}

function extractExternalReference(
  gateway: string,
  payload: Record<string, unknown>
): string | null {
  if (gateway === "pagarme") {
    const data = payload.data as Record<string, unknown> | undefined;
    const metadata = data?.metadata as Record<string, unknown> | undefined;
    return typeof metadata?.external_reference === "string"
      ? metadata.external_reference
      : null;
  }
  const payment = payload.payment as Record<string, unknown> | undefined;
  return typeof payment?.externalReference === "string" ? payment.externalReference : null;
}

function isPaymentConfirmedEvent(gateway: string, eventType: string): boolean {
  if (gateway === "pagarme") return eventType === "charge.paid";
  return eventType === "PAYMENT_CONFIRMED" || eventType === "PAYMENT_RECEIVED";
}

/**
 * O GATILHO FINAL. Só esta rota chama isto, e só depois de assinatura
 * válida + evento de pagamento confirmado + lead encontrado. NÃO
 * IMPLEMENTADO — é mock de propósito, porque criar tenant é mudança de
 * RBAC no repo do AutoGiro (app.autogirodms.com.br, Railway) e precisa do
 * próprio /plan aprovado lá antes de qualquer chamada de verdade sair
 * daqui. Ver README, seção "A ponte para o app principal".
 */
async function triggerProvisioning(lead: SignupLead, eventId: string): Promise<void> {
  console.log(
    `[webhooks/payment] MOCK — provisionaria a loja de ${lead.email} (plano ${lead.plan}, evento ${eventId})`
  );

  // TODO (precisa de /plan aprovado no repo do AutoGiro antes de existir):
  // const res = await fetch(`${process.env.AUTOGIRO_APP_URL}/api/internal/provision-tenant`, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     // Segredo compartilhado, não sessão de usuário — esta chamada não
  //     // tem um humano logado por trás, é serviço-a-serviço.
  //     Authorization: `Bearer ${process.env.PROVISIONING_SHARED_SECRET}`,
  //   },
  //   body: JSON.stringify({
  //     nome: lead.nome,
  //     email: lead.email,
  //     whatsapp: lead.whatsapp,
  //     plan: lead.plan,
  //     paymentEventId: eventId, // permite ao AutoGiro também deduplicar do lado dele
  //   }),
  // });
  // if (!res.ok) throw new Error(`Falha ao provisionar tenant: ${res.status}`);

  // TODO: e-mail de "Acesso Liberado" (Resend) SÓ depois que o provisionamento
  // acima confirmar sucesso — mandar o e-mail antes disso anunciaria um
  // acesso que ainda não existe.
  // await sendAccessGrantedEmail(lead.email, lead.nome, loginUrl);
}
