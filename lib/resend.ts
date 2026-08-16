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

// ── Notificação interna de lead novo ────────────────────────────────────────
// O lead vivia só no Redis, com TTL de 15 min, esperando a própria pessoa
// concluir o OTP. Se ela parasse no meio, ninguém da equipe nunca soube que
// existiu. Este aviso fecha esse buraco: sai no momento em que o lead passa
// pelos muros de anti-abuso, antes de qualquer confirmação de código.

const DEFAULT_LEAD_INBOX = "yagocandeia93@gmail.com";

export interface NewLeadNotice {
  nome: string;
  email: string;
  whatsapp: string;
  /** Nome da loja. Sempre presente no fluxo de demonstração. */
  loja?: string;
  /** Ausente no fluxo de demonstração, onde ninguém escolheu plano. */
  plan?: "BASICO" | "PRO";
  /**
   * "demonstracao" = veio do modal de "Agendar demonstração" da landing e não
   * escolheu plano. "plano" = clicou em Assinar/Começar agora.
   */
  origem?: "demonstracao" | "plano";
}

/** Link direto de conversa com o lead, com a primeira mensagem já escrita. */
function leadWhatsappLink(whatsapp: string, nome: string): string {
  const digits = whatsapp.replace(/\D/g, "");
  // Números do formulário vêm com DDD mas sem código de país.
  const e164 = digits.length <= 11 ? `55${digits}` : digits;
  const primeiroNome = nome.trim().split(/\s+/)[0];
  const msg =
    `Olá, ${primeiroNome}! Sou consultor do AutoGiro DMS e vi que você ` +
    `começou o cadastro no nosso site. Posso te mostrar o sistema com os ` +
    `carros da sua loja?`;
  return `https://wa.me/${e164}?text=${encodeURIComponent(msg)}`;
}

function newLeadEmailHtml(lead: NewLeadNotice): string {
  const linha = (rotulo: string, valor: string) => `
      <tr>
        <td style="padding: 7px 0; font-size: 13px; color: #94a1b5; white-space: nowrap;">${rotulo}</td>
        <td style="padding: 7px 0 7px 18px; font-size: 14px; color: #e9edf3; font-weight: 600;">${valor}</td>
      </tr>`;

  const wa = leadWhatsappLink(lead.whatsapp, lead.nome);
  const isDemo = lead.origem === "demonstracao";
  const planoTexto = lead.plan === "PRO" ? "Pro (R$ 499/mês)" : "Básico (R$ 299/mês)";

  const linhaLoja = lead.loja
    ? linha("Loja", escapeHtml(lead.loja))
    : "";

  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0e14; padding: 32px; color: #e9edf3;">
    <div style="max-width: 480px; margin: 0 auto; background: #111823; border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 32px;">
      <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #f5a524;">AutoGiro DMS</p>
      <h1 style="margin: 0 0 6px; font-size: 20px; font-weight: 700;">${
        isDemo ? "Pedido de demonstração" : "Lead novo no site"
      }</h1>
      <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #94a1b5;">
        ${
          isDemo
            ? "Preencheu o formulário de demonstração na landing e passou pelo Turnstile e pelo rate limit. Está esperando o contato de um consultor."
            : "Passou pelo Turnstile e pelo rate limit, e recebeu o código de verificação por e-mail. Ainda não confirmou o código."
        }
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
        Falar com o lead no WhatsApp
      </a>
      <p style="margin: 20px 0 0; font-size: 12px; line-height: 1.6; color: #7c8899;">
        ${
          isDemo
            ? "Este e-mail é o único registro do pedido — o fluxo de demonstração não grava nada no banco."
            : "O registro fica na sala de espera do Redis por 15 minutos. Depois disso, só este e-mail resta como rastro do contato."
        }
      </p>
    </div>
  </div>`;
}

/**
 * Avisa a equipe que entrou um lead novo. Nunca lança — quem chama decide o
 * que fazer com a falha pelo retorno:
 *
 * - fluxo de assinatura ignora o retorno, porque o lead já está salvo no Redis
 *   e o visitante tem o OTP para seguir: derrubar a resposta por causa de um
 *   e-mail interno faria a pessoa perder o cadastro por um problema nosso;
 * - fluxo de demonstração checa o retorno, porque este e-mail é o único
 *   registro do pedido — sem ele, o lead não existe em lugar nenhum.
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
      // console É a entrega aqui, então conta como sucesso — senão o modal de
      // demonstração ficaria impossível de testar localmente.
      console.warn(
        `[resend] RESEND_API_KEY não configurada — lead novo não enviado para ` +
          `${to}. Conteúdo: ${JSON.stringify(lead)}`
      );
      return true;
    }

    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) {
      console.error(
        "[resend] RESEND_FROM_EMAIL ausente — lead novo não notificado."
      );
      return false;
    }

    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: lead.email,
      subject:
        lead.origem === "demonstracao"
          ? `Pedido de demonstração: ${lead.nome}${lead.loja ? ` — ${lead.loja}` : ""}`
          : `Lead novo: ${lead.nome} — plano ${lead.plan}`,
      html: newLeadEmailHtml(lead),
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
