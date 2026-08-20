import type { SignupLead } from "@/lib/leadStore";
import { currentGateway } from "@/lib/webhookSignature";
import { PLANS } from "@/lib/plans";

/**
 * Cria a sessão de checkout no gateway escolhido e devolve a URL de
 * pagamento. AINDA NÃO CHAMA NENHUM GATEWAY DE VERDADE — as chaves (Asaas ou
 * Pagar.me) só saem sexta-feira. O que importa aqui é a forma: `email` vai
 * como `external_reference`/metadata da cobrança, porque é isso que o webhook
 * (app/api/webhooks/payment) usa pra achar de volta qual `signup-lead` no
 * Redis foi pago.
 *
 * Quando o SDK entrar, o corpo desta função vira a chamada real — a
 * assinatura (recebe o lead, devolve a URL) não muda.
 */
export async function createCheckoutLink(lead: SignupLead): Promise<string> {
  const gateway = currentGateway();
  const amountCents = PLANS[lead.plan].priceCents;

  if (gateway === "asaas") {
    // TODO (sexta, com a chave do Asaas):
    // const asaas = new AsaasClient(process.env.ASAAS_API_KEY!);
    // const customer = await asaas.customers.create({ name: lead.nome, email: lead.email, phone: lead.whatsapp });
    // const payment = await asaas.paymentLinks.create({
    //   customer: customer.id,
    //   billingType: "UNDEFINED", // deixa o cliente escolher PIX ou cartão
    //   value: amountCents / 100,
    //   externalReference: lead.email,
    //   description: `AutoGiro DMS — plano ${lead.plan}`,
    // });
    // return payment.url;
  } else {
    // TODO (sexta, com a chave do Pagar.me):
    // const pagarme = new PagarmeClient(process.env.PAGARME_API_KEY!);
    // const order = await pagarme.orders.create({
    //   items: [{ amount: amountCents, description: `AutoGiro DMS — plano ${lead.plan}`, quantity: 1 }],
    //   customer: { name: lead.nome, email: lead.email, phones: { mobile_phone: lead.whatsapp } },
    //   metadata: { external_reference: lead.email },
    //   payments: [{ payment_method: "checkout", checkout: { accepted_payment_methods: ["credit_card", "pix"] } }],
    // });
    // return order.checkouts[0].payment_url;
  }

  // Placeholder até as chaves existirem: manda pra página de checkout local
  // (app/checkout) — o mesmo destino para onde public/lead-modal.js manda quem
  // envia o formulário na landing. A página mostra o resumo do plano e o
  // formulário de cartão, e diz na cara que a cobrança ainda está sendo
  // configurada, em vez de quebrar o fluxo de ponta a ponta.
  const params = new URLSearchParams({ email: lead.email, plano: lead.plan });
  return `/checkout?${params.toString()}`;
}
