import styles from "./landing.module.css";

const monoFont = "'Geist Mono', monospace";

interface Plan {
  id: "BASICO" | "PRO";
  name: string;
  tagline: string;
  price: string;
  features: string[];
  highlight: boolean;
}

const PLANS: Plan[] = [
  {
    id: "BASICO",
    name: "Básico",
    tagline: "Revendas que precisam sair da planilha.",
    price: "R$ 299",
    features: [
      "Até 10 veículos ativos em estoque",
      "1 usuário: apenas o dono (gestão individual)",
      "Custos por veículo, consulta FIPE e placa",
      "Vendas, contratos, cobranças e painel de margem",
    ],
    highlight: false,
  },
  {
    id: "PRO",
    name: "Pro",
    tagline: "Operação que vive de giro e margem.",
    price: "R$ 499",
    features: [
      "Estoque sem limite de veículos e 5 usuários",
      "CRM de leads em Kanban com WhatsApp",
      "Publicação automática nos portais parceiros",
      "Mesa de crédito multibancos em uma proposta",
    ],
    highlight: true,
  },
];

/**
 * Extraído do bundle legado como componente React idiomático (docs/STATUS.md,
 * item 10). A landing em "/" continua mostrando os Planos de dentro do bundle
 * (public/legacy-content.html) — hoje não é seguro tirá-los de lá sem quebrar
 * a reatividade da Calculadora, ver o comentário grande em
 * public/legacy-mount.js. Este componente é a versão real, reutilizável, e é
 * usado de verdade em /inscricao: quem chega ali clicando num CTA de
 * demonstração (sem plano escolhido) via um comparativo de planos que antes
 * só existia na landing.
 *
 * `badgeLabel` replica o prop configurável `planoDestaque` do bundle
 * (default "Mais escolhido").
 */
export function Pricing({
  badgeLabel = "Mais escolhido",
  highlightPlan,
}: {
  badgeLabel?: string;
  highlightPlan?: Plan["id"];
}) {
  return (
    <div className={styles.pricingGrid} style={{ gap: 20, alignItems: "start" }}>
      {PLANS.map((plan) => (
        <PlanCard key={plan.id} plan={plan} badgeLabel={badgeLabel} isCurrent={plan.id === highlightPlan} />
      ))}
    </div>
  );
}

function PlanCard({ plan, badgeLabel, isCurrent }: { plan: Plan; badgeLabel: string; isCurrent: boolean }) {
  const highlighted = plan.highlight;
  return (
    <div
      style={{
        background: highlighted ? "#111823" : "#0e141d",
        border: highlighted ? "1px solid #f5a524" : "1px solid rgba(255,255,255,0.09)",
        borderRadius: 14,
        padding: 30,
        position: "relative",
        outline: isCurrent ? "2px solid #f5a524" : undefined,
        outlineOffset: isCurrent ? 2 : undefined,
      }}
    >
      {highlighted && (
        <span
          style={{
            position: "absolute",
            top: 18,
            right: 20,
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: 999,
            background: "#f5a524",
            color: "#1b1305",
          }}
        >
          {badgeLabel}
        </span>
      )}
      <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>{plan.name}</p>
      <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "#94a1b5" }}>{plan.tagline}</p>
      <p style={{ margin: "0 0 26px", fontFamily: monoFont, fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em" }}>
        {plan.price}
        <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, fontWeight: 400, color: "#94a1b5" }}>
          {" "}
          /mês
        </span>
      </p>
      <div style={{ display: "grid", gap: 12, marginBottom: 28 }}>
        {plan.features.map((f) => (
          <p key={f} style={{ margin: 0, fontSize: 14.5, color: highlighted ? "#e9edf3" : "#c7d0dc" }}>
            {f}
          </p>
        ))}
      </div>
      <a
        href={`/inscricao?plano=${plan.id}`}
        className={highlighted ? styles.planLinkSolid : styles.planLinkOutline}
      >
        {highlighted ? "Começar agora" : "Assinar agora"}
      </a>
    </div>
  );
}
