import { SignupForm } from "@/components/SignupForm";

type Plan = "BASICO" | "PRO";

function parsePlan(value: string | string[] | undefined): Plan {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "PRO" ? "PRO" : "BASICO";
}

export default async function InscricaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const plan = parsePlan(params.plano);

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
      <SignupForm plan={plan} />
    </main>
  );
}
