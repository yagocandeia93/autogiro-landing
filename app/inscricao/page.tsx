import { SignupForm } from "@/components/SignupForm";
import { Pricing } from "@/components/landing/Pricing";

type Plan = "BASICO" | "PRO";

function parsePlan(value: string | string[] | undefined): Plan {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "PRO" ? "PRO" : "BASICO";
}

/**
 * Os CTAs de "Agendar demonstração" da landing chegam com
 * `?origem=demonstracao` e sem plano. Sem essa distinção o `parsePlan` acima
 * assumiria BASICO em silêncio, e o lead apareceria para a equipe como se
 * tivesse escolhido um plano que ele nunca viu.
 */
function isDemoOrigin(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "demonstracao";
}

export default async function InscricaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const plan = parsePlan(params.plano);
  const demo = isDemoOrigin(params.origem);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        background: "#0a0e14",
        color: "#e9edf3",
        padding: "48px 24px",
      }}
    >
      {/*
        Quem chega pelo modal de demonstração ainda não escolheu plano — a
        landing já mostra os Planos, mas nada aqui repetia essa informação
        (docs/STATUS.md, item 10: componentização do bundle). Quem já
        escolheu um plano (veio de /inscricao?plano=…) não precisa comparar
        de novo, então o comparativo só aparece no caminho de demonstração.
      */}
      {demo && (
        <div style={{ width: "100%", maxWidth: 700 }}>
          <p
            style={{
              margin: "0 0 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "#f5a524",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              textAlign: "center",
            }}
          >
            Enquanto isso, veja os planos
          </p>
          <Pricing />
        </div>
      )}
      <SignupForm plan={plan} demo={demo} />
    </main>
  );
}
