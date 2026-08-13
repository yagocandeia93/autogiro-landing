// Placeholder até o gateway (Asaas ou Pagar.me) ser configurado sexta-feira.
// `lib/checkout.ts` manda pra cá enquanto `createCheckoutLink` não tem uma
// chave de verdade pra gerar um link de pagamento real.

const PLAN_LABEL: Record<string, string> = {
  BASICO: "Básico",
  PRO: "Pro",
};

export default async function CheckoutPlaceholder({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";
  const plano = typeof params.plano === "string" ? params.plano : "";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0e14",
        padding: 24,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#e9edf3",
      }}
    >
      <div
        style={{
          background: "#111823",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 14,
          padding: 30,
          maxWidth: 440,
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            fontSize: 13,
            fontWeight: 600,
            color: "#f5a524",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Plano {PLAN_LABEL[plano] ?? plano}
        </p>
        <h1 style={{ margin: "0 0 14px", fontSize: 19, fontWeight: 700 }}>
          Falta só o pagamento.
        </h1>
        <p style={{ margin: "0 0 8px", color: "#94a1b5", fontSize: 14.5, lineHeight: 1.6 }}>
          Seu e-mail já foi verificado. A cobrança (PIX ou cartão) ainda está sendo
          configurada — assim que estiver no ar, você recebe o link de pagamento em{" "}
          <strong style={{ color: "#e9edf3" }}>{email || "seu e-mail"}</strong>.
        </p>
        <p style={{ margin: 0, color: "#7c8899", fontSize: 13 }}>
          Nada foi cobrado ainda.
        </p>
      </div>
    </main>
  );
}
