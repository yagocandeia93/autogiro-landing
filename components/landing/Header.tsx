import Image from "next/image";
import styles from "./landing.module.css";
import { WA_LINK_CONSULTOR } from "@/lib/whatsapp";
import { APP_LOGIN_URL } from "@/lib/app";

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
        // Acima de tudo que rola por baixo, e deliberadamente abaixo do modal
        // de lead (z-index 9000 em public/lead-modal.js): o cabeçalho não pode
        // atravessar a janela aberta em cima dele.
        zIndex: 50,
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
          {/* O nome da marca escrito ao lado some abaixo de 520px (não cabe
              junto dos dois botões), então o alt é quem carrega o nome em
              qualquer largura — e o wordmark visível fica aria-hidden para o
              leitor de tela não anunciar "AutoGiro DMS" duas vezes. */}
          <Image
            src="/Logo.png"
            alt="AutoGiro DMS"
            width={26}
            height={26}
            priority
            style={{ display: "block" }}
          />
          <span
            aria-hidden="true"
            className={styles.hideBelow520}
            style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}
          >
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
      {/* Duas intenções distintas, e o espaçamento é quem diz isso: "Entrar"
          serve quem já é cliente, WhatsApp e demonstração servem quem ainda
          não é. Daí o gap de 22px aqui contra os 12px de dentro do grupo de
          conversão — os dois botões de lead lêem como um bloco só, e o
          acesso fica visivelmente à parte, antes deles. */}
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        {/* Ponte para o app no Railway (lib/app.ts): quem já é cliente entra,
            quem ainda não é continua olhando para o botão âmbar. Por isso o
            fantasma — a hierarquia visual é ghost < contorno (WhatsApp) <
            âmbar sólido, e a conversão segue sendo a demonstração.
            Sem target="_blank": é o mesmo produto, não um site de terceiros. */}
        <a href={APP_LOGIN_URL} className={styles.loginLink}>
          Entrar
        </a>
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
      </div>
    </header>
  );
}
