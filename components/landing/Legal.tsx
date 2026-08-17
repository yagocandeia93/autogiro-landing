import { TrustBadges } from "./TrustBadges";

const monoFont = "'Geist Mono', monospace";

/**
 * Migrada do bundle legado para React real, SSR'd — mesma trilha do
 * Cabeçalho/Hero (docs/STATUS.md, itens 10 e 11): a seção é estática, sem
 * nenhum valor dependente de `state`, então tirá-la do `<x-dc>` antes do boot
 * é seguro. Ver o comentário grande em public/legacy-mount.js.
 *
 * A seção deixou de ser três cards com nove parágrafos abertos na página e
 * virou três selos de confiança; o texto integral continua inteiro, atrás dos
 * modais em TrustBadges.tsx. O `<h2>`, o subtítulo e a linha do encarregado
 * de dados são server-rendered — só a interação dos selos precisa de cliente.
 */
export function Legal() {
  return (
    <section
      id="legal"
      style={{
        borderTop: "1px solid rgba(255,255,255,0.08)",
        background: "var(--ag-surface-base)",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "clamp(48px, 5vw, 72px) clamp(20px, 5vw, 64px)",
        }}
      >
        <div style={{ maxWidth: "58ch", marginBottom: 28 }}>
          <h2
            style={{
              fontSize: "clamp(24px, 2.6vw, 33px)",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              fontWeight: 700,
              margin: "0 0 12px",
            }}
          >
            Regras claras sobre os seus dados.
          </h2>
          <p style={{ margin: 0, fontSize: 16, color: "#94a1b5", lineHeight: 1.6 }}>
            As três políticas que regem o uso do AutoGiro DMS, na íntegra — em um clique, quando
            você quiser ler.
          </p>
        </div>

        <TrustBadges />

        <p style={{ margin: "24px 0 0", fontFamily: monoFont, fontSize: 12, color: "#6b7889" }}>
          Última atualização: agosto de 2026. Encarregado de dados: privacidade@autogirodms.com.br
        </p>
      </div>
    </section>
  );
}
