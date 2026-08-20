import Image from "next/image";
import styles from "./landing.module.css";
import { WA_LINK_CONSULTOR } from "@/lib/whatsapp";

const NAV_LINKS = [
  { href: "#calculadora", label: "Calculadora" },
  { href: "#estoque", label: "Estoque" },
  { href: "#crm", label: "CRM" },
  { href: "#portais", label: "Portais" },
  { href: "#planos", label: "Planos" },
];

/**
 * Migrado do bundle legado (public/legacy-content.html) para React real e
 * SSR'd — ver docs/STATUS.md, itens 10 e 11. Sem state, sem slider: seguro
 * de tirar do `<x-dc>` reativo (detalhes em public/legacy-mount.js).
 *
 * `data-ag-demo` é o único contrato com public/lead-modal.js: ele delega o
 * clique no `document`, então este atributo é tudo que o botão precisa —
 * nenhuma lógica de modal migra para cá. (Os botões de plano usam o mesmo
 * mecanismo com `data-ag-signup="BASICO|PRO"`, mas vivem no bundle.)
 */
export function Header() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        height: 68,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "0 clamp(20px, 5vw, 64px)",
        background: "rgba(10,14,20,0.9)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 34, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* alt vazio: o nome da marca vem escrito ao lado, e repeti-lo faria
              o leitor de tela anunciar "AutoGiro DMS" duas vezes seguidas. */}
          <Image
            src="/Logo.png"
            alt=""
            width={26}
            height={26}
            priority
            style={{ display: "block" }}
          />
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
            AutoGiro <span style={{ color: "#94a1b5", fontWeight: 500 }}>DMS</span>
          </span>
        </div>
        <nav
          className={styles.hideBelow1100}
          style={{ display: "flex", alignItems: "center", gap: 26 }}
        >
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={styles.navLink}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <a
          href={WA_LINK_CONSULTOR}
          target="_blank"
          rel="noopener"
          className={`${styles.waPill} ${styles.hideBelow1100}`}
        >
          <span
            aria-hidden="true"
            style={{
              width: 15,
              height: 15,
              background: "currentColor",
              display: "block",
              WebkitMaskImage: "url(/icons/whatsapp.svg)",
              maskImage: "url(/icons/whatsapp.svg)",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
            }}
          />
          WhatsApp
        </a>
        <a href="#demo" data-ag-demo="" className={styles.ctaButton}>
          Agendar demonstração
        </a>
      </div>
    </header>
  );
}
