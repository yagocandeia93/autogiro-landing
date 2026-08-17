import styles from "./landing.module.css";
import { WA_LINK_SUPORTE } from "@/lib/whatsapp";

const monoFont = "'Geist Mono', monospace";

/**
 * Migrado do bundle legado para React real, SSR'd. Saiu junto com a seção
 * Legal, e não por vontade de migrar mais uma coisa: o rodapé vinha DEPOIS de
 * `#legal` dentro do mesmo `<x-dc>`, então deixá-lo lá embaixo colocaria a
 * seção Legal (agora React, renderizada após #ag-legacy-root) abaixo do
 * rodapé. Os dois são estáticos, então sair antes do boot do runtime é seguro
 * — mesma regra do Cabeçalho/Hero, documentada em public/legacy-mount.js.
 *
 * Única interpolação que o rodapé tinha, `{{ waLinkSuporte }}`, virou
 * WA_LINK_SUPORTE em lib/whatsapp.ts, com a mesma mensagem que o runtime
 * gerava. Os `style-hover` viraram :hover de verdade no CSS module.
 */

const LINKS_PRODUTO = [
  { href: "#estoque", label: "Gestão de estoque" },
  { href: "#crm", label: "CRM e funil" },
  { href: "#portais", label: "Portais e redes" },
];

/** Os três anchors que TrustBadges.tsx transforma em modal. */
const LINKS_LEGAL = [
  { href: "#privacidade", label: "Política de privacidade" },
  { href: "#termos", label: "Termos de uso" },
  { href: "#lgpd", label: "Tratamento de dados (LGPD)" },
];

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "48px clamp(20px, 5vw, 64px) 36px",
      }}
    >
      <div className={styles.footerGrid} style={{ maxWidth: 1400, margin: "0 auto", gap: 40 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span
              aria-hidden="true"
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                background: "#f5a524",
                display: "block",
                WebkitMaskImage: "url(/icons/logo-mark.svg)",
                maskImage: "url(/icons/logo-mark.svg)",
                WebkitMaskSize: "19px",
                maskSize: "19px",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
              }}
            />
            <span style={{ fontSize: 15, fontWeight: 700 }}>AutoGiro DMS</span>
          </div>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 13.5,
              color: "#94a1b5",
              lineHeight: 1.6,
              maxWidth: "34ch",
            }}
          >
            Sistema de gestão para concessionárias, lojas de seminovos e operações de repasse.
          </p>
          <p style={{ margin: 0, fontFamily: monoFont, fontSize: 12, color: "#6b7889" }}>
            Dados hospedados no Brasil, com backup diário.
          </p>
        </div>

        <ColunaLinks titulo="Produto">
          {LINKS_PRODUTO.map((l) => (
            <a key={l.href} href={l.href} className={styles.footerLink}>
              {l.label}
            </a>
          ))}
        </ColunaLinks>

        <ColunaLinks titulo="Empresa">
          <a href="#planos" className={styles.footerLink}>
            Planos
          </a>
          <a href="#demo" data-ag-demo="" className={styles.footerLink}>
            Agendar demonstração
          </a>
          <a href={WA_LINK_SUPORTE} target="_blank" rel="noopener" className={styles.footerLink}>
            Suporte
          </a>
        </ColunaLinks>

        <ColunaLinks titulo="Legal">
          {LINKS_LEGAL.map((l) => (
            <a key={l.href} href={l.href} className={styles.footerLink}>
              {l.label}
            </a>
          ))}
        </ColunaLinks>
      </div>

      <p
        style={{
          maxWidth: 1400,
          margin: "40px auto 0",
          paddingTop: 22,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          fontSize: 12.5,
          color: "#6b7889",
        }}
      >
        © 2026 AutoGiro DMS. Todos os direitos reservados.
      </p>
    </footer>
  );
}

function ColunaLinks({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "#c7d0dc" }}>{titulo}</p>
      <div style={{ display: "grid", gap: 9 }}>{children}</div>
    </div>
  );
}
