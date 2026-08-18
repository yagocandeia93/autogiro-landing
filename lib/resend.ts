import { Resend } from "resend";

let client: Resend | null | undefined;

function getClient(): Resend | null {
  if (client !== undefined) return client;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RESEND_API_KEY ausente em produção. Sem ela, o lead preenche o " +
          "formulário, recebe um 'pedido recebido' e ninguém da equipe fica " +
          "sabendo — o aviso por e-mail é o único registro do contato."
      );
    }
    client = null;
    return client;
  }

  client = new Resend(apiKey);
  return client;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Notificação interna de lead novo ────────────────────────────────────────
// Este aviso é o entregável dos dois funis do modal: com o fim da verificação
// por código, nada acontece depois do envio do formulário — quem fecha a venda
// é um consultor pelo WhatsApp, e é este e-mail que dispara essa ligação. Por
// isso /api/signup-intent falha a requisição quando ele não sai: sem aviso, o
// pedido não existe para a equipe.

const DEFAULT_LEAD_INBOX = "yagocandeia93@gmail.com";

export interface NewLeadNotice {
  nome: string;
  email: string;
  whatsapp: string;
  /** Nome da loja. Obrigatório nos dois funis desde a unificação dos campos. */
  loja?: string;
  /** Ausente no fluxo de demonstração, onde ninguém escolheu plano. */
  plan?: "BASICO" | "PRO";
  /**
   * "demonstracao" = veio dos CTAs de "Agendar demonstração" e não escolheu
   * plano. "plano" = clicou em Assinar/Começar agora no card de um plano.
   */
  origem?: "demonstracao" | "plano";
}

const PLAN_TEXTO: Record<"BASICO" | "PRO", string> = {
  BASICO: "Básico (R$ 299/mês)",
  PRO: "Pro (R$ 499/mês)",
};

/** Link direto de conversa com o lead, com a primeira mensagem já escrita. */
function leadWhatsappLink(lead: NewLeadNotice): string {
  const digits = lead.whatsapp.replace(/\D/g, "");
  // Números do formulário vêm com DDD mas sem código de país.
  const e164 = digits.length <= 11 ? `55${digits}` : digits;
  const primeiroNome = lead.nome.trim().split(/\s+/)[0];
  // Quem clicou em assinar já escolheu plano e preço: a primeira mensagem não
  // pode soar como se a equipe não tivesse visto isso.
  const msg =
    lead.origem === "demonstracao"
      ? `Olá, ${primeiroNome}! Sou consultor do AutoGiro DMS e vi que você ` +
        `pediu uma demonstração no nosso site. Posso te mostrar o sistema com ` +
        `os carros da sua loja?`
      : `Olá, ${primeiroNome}! Sou consultor do AutoGiro DMS e vi que você ` +
        `escolheu o plano ${lead.plan === "PRO" ? "Pro" : "Básico"} no nosso ` +
        `site. Posso te ajudar a ativar a sua loja hoje mesmo?`;
  return `https://wa.me/${e164}?text=${encodeURIComponent(msg)}`;
}

function leadEmailHtml(lead: NewLeadNotice): string {
  const linha = (rotulo: string, valor: string) => `
      <tr>
        <td style="padding: 7px 0; font-size: 13px; color: #94a1b5; white-space: nowrap;">${rotulo}</td>
        <td style="padding: 7px 0 7px 18px; font-size: 14px; color: #e9edf3; font-weight: 600;">${valor}</td>
      </tr>`;

  const wa = leadWhatsappLink(lead);
  const isDemo = lead.origem === "demonstracao";
  const planoTexto = PLAN_TEXTO[lead.plan ?? "BASICO"];

  const linhaLoja = lead.loja ? linha("Loja", escapeHtml(lead.loja)) : "";

  const titulo = isDemo ? "Pedido de demonstração" : "Lead novo: quer assinar";

  const chamada = isDemo
    ? "Preencheu o formulário de demonstração na landing e passou pelo Turnstile e pelo rate limit. Está esperando o contato de um consultor."
    : "Escolheu o plano no card de Planos da landing e passou pelo Turnstile e pelo rate limit. Do lado dele não sobrou nenhuma etapa: a ativação depende deste contato.";

  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0e14; padding: 32px; color: #e9edf3;">
    <div style="max-width: 480px; margin: 0 auto; background: #111823; border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 32px;">
      <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #f5a524;">AutoGiro DMS</p>
      <h1 style="margin: 0 0 6px; font-size: 20px; font-weight: 700;">${titulo}</h1>
      <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #94a1b5;">
        ${chamada}
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 24px;">
        ${linha("Nome", escapeHtml(lead.nome))}
        ${linhaLoja}
        ${linha("E-mail", escapeHtml(lead.email))}
        ${linha("WhatsApp", escapeHtml(lead.whatsapp))}
        ${linha(
          "Interesse",
          isDemo
            ? '<span style="color: #f5a524;">Demonstração</span> — não escolheu plano'
            : planoTexto
        )}
      </table>
      <a href="${wa}" style="display: block; text-align: center; background: #f5a524; color: #1b1305; border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 600; text-decoration: none;">
        ${isDemo ? "Falar com o lead no WhatsApp" : "Ajudar a ativar no WhatsApp"}
      </a>
      <p style="margin: 20px 0 0; font-size: 12px; line-height: 1.6; color: #7c8899;">
        ${
          isDemo
            ? "Este e-mail é o único registro do pedido — o fluxo de demonstração não grava nada no banco."
            : "O lead também fica guardado no Redis por 7 dias, à espera da confirmação de pagamento. Depois disso, só este e-mail resta como rastro do contato."
        }
      </p>
    </div>
  </div>`;
}

function leadEmailSubject(lead: NewLeadNotice): string {
  const loja = lead.loja ? ` — ${lead.loja}` : "";
  return lead.origem === "demonstracao"
    ? `Pedido de demonstração: ${lead.nome}${loja}`
    : `Quer assinar: ${lead.nome}${loja} — plano ${lead.plan}`;
}

/**
 * Avisa a equipe que entrou um lead novo. Nunca lança: quem chama decide o que
 * fazer com a falha pelo retorno booleano.
 *
 * Retorna `true` quando o aviso foi entregue (ou deliberadamente impresso no
 * console em dev, que é a entrega esperada ali) e `false` em falha real.
 */
export async function notifyNewLead(lead: NewLeadNotice): Promise<boolean> {
  try {
    const resend = getClient();
    const to = process.env.LEAD_NOTIFICATION_EMAIL || DEFAULT_LEAD_INBOX;

    if (!resend) {
      // Dev sem RESEND_API_KEY (em produção getClient lança): imprimir no
      // console É a entrega aqui, então conta como sucesso — senão o modal
      // ficaria impossível de testar localmente.
      console.warn(
        `[resend] RESEND_API_KEY não configurada — aviso de lead não enviado ` +
          `para ${to}. Conteúdo: ${JSON.stringify(lead)}`
      );
      return true;
    }

    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) {
      console.error("[resend] RESEND_FROM_EMAIL ausente — aviso de lead não enviado.");
      return false;
    }

    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: lead.email,
      subject: leadEmailSubject(lead),
      html: leadEmailHtml(lead),
    });

    if (error) {
      console.error(
        `[resend] falha ao notificar lead novo (${lead.email}): ${error.message}`
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error("[resend] erro inesperado ao notificar lead novo:", err);
    return false;
  }
}
