/**
 * Fonte única dos dois planos vendidos na landing. O preço vivia duplicado em
 * três lugares — no template do bundle (public/legacy-content.html), no modal
 * (public/lead-modal.js) e em `PLAN_PRICE_CENTS` de lib/checkout.ts — e agora
 * que /checkout monta o resumo do pedido a partir do plano que veio na URL,
 * uma quarta cópia sairia cara na primeira vez que a tabela mudasse.
 *
 * Os dois arquivos em public/ continuam com o texto próprio (são JS/HTML
 * servidos estáticos, fora da árvore de módulos do Next, sem como importar
 * daqui); o que este módulo cobre é todo o lado TypeScript: lib/checkout.ts e
 * a página de checkout.
 */

export type PlanId = "BASICO" | "PRO";

export interface Plan {
  id: PlanId;
  /** Nome como aparece para quem compra ("Plano Pro"). */
  label: string;
  /** Para quem o plano é — mesma frase do card de Planos na landing. */
  tagline: string;
  /** Valor em centavos, que é o que os gateways cobram. */
  priceCents: number;
  /** Preço já formatado, sem o "/mês" (o layout separa os dois). */
  priceLabel: string;
  /** O que entra no plano, na mesma ordem do card da landing. */
  highlights: string[];
}

export const TRIAL_DAYS = 7;

export const PLANS: Record<PlanId, Plan> = {
  BASICO: {
    id: "BASICO",
    label: "Básico",
    tagline: "Revendas que precisam sair da planilha.",
    priceCents: 29900,
    priceLabel: "R$ 299",
    highlights: [
      "Até 10 veículos ativos em estoque",
      "1 usuário: apenas o dono (gestão individual)",
      "Custos por veículo, consulta FIPE e placa",
      "Vendas, contratos, cobranças e painel de margem",
    ],
  },
  PRO: {
    id: "PRO",
    label: "Pro",
    tagline: "Operação que vive de giro e margem.",
    priceCents: 49900,
    priceLabel: "R$ 499",
    highlights: [
      "Tudo do plano Básico, mais:",
      "Estoque sem limite de veículos e 5 acessos com permissões",
      "CRM de leads em Kanban com WhatsApp",
      "Integração e repasse automático para os portais parceiros",
      "Mesa de crédito multibancos em uma proposta",
      "Suporte prioritário humano via WhatsApp",
    ],
  },
};

/**
 * Plano que veio da URL (`/checkout?plano=…`). Qualquer valor desconhecido cai
 * em BASICO — é o mesmo piso que public/lead-modal.js assume quando o atributo
 * do botão vem estranho, e o mesmo que a API trata como padrão. Melhor mostrar
 * o plano de entrada do que uma tela de erro para quem acabou de se cadastrar.
 */
export function parsePlan(value: unknown): PlanId {
  return value === "PRO" ? "PRO" : "BASICO";
}
