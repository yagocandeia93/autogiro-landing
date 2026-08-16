import { SignupForm } from "@/components/SignupForm";

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
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0e14",
        padding: 24,
      }}
    >
      <SignupForm plan={plan} demo={demo} />
    </main>
  );
}
