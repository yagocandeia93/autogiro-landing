import styles from "./landing.module.css";
import { WA_LINK_DEMO } from "@/lib/whatsapp";

const monoFont = "'Geist Mono', monospace";

/**
 * Migrado do bundle legado para React real, SSR'd — a primeira dobra da
 * página (headline, subtítulo, CTA e o mockup do painel executivo) agora
 * chega no primeiro byte de HTML, sem depender de JavaScript rodar antes da
 * primeira pintura (docs/STATUS.md, item 11). Ver o comentário grande em
 * public/legacy-mount.js para o motivo de a Calculadora logo abaixo NÃO ter
 * seguido pelo mesmo caminho.
 */
export function Hero() {
  return (
    <section
      className={styles.heroGrid}
      style={{
        gap: "clamp(32px, 5vw, 72px)",
        alignItems: "center",
        maxWidth: 1400,
        margin: "0 auto",
        padding: "clamp(40px, 6vw, 88px) clamp(20px, 5vw, 64px) 72px",
      }}
    >
      <div>
        <h1
          style={{
            fontSize: "clamp(34px, 3.9vw, 52px)",
            lineHeight: 1.08,
            letterSpacing: "-0.028em",
            fontWeight: 700,
            margin: "0 0 20px",
            textWrap: "pretty",
          }}
        >
          Gire o estoque mais rápido e saiba o lucro real de cada carro.
        </h1>
        <p style={{ fontSize: 17.5, lineHeight: 1.55, color: "#94a1b5", margin: "0 0 32px", maxWidth: "46ch" }}>
          Estoque, CRM de leads, publicação nos portais e margem por veículo em um único sistema.
        </p>
        <div
          id="demo"
          style={{
            background: "#111823",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 14,
            padding: 22,
            maxWidth: 460,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>Agendar demonstração gratuita</p>
          <p style={{ margin: "0 0 18px", fontSize: 14, color: "#94a1b5", lineHeight: 1.55 }}>
            Trinta minutos com um consultor, com o seu estoque na tela. Preencha os dados da loja e o contato é
            feito em até 1 dia útil.
          </p>
          <a href="#demo" data-ag-demo="" className={styles.ctaButtonBlock}>
            Quero uma demonstração
          </a>
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#7c8899", textAlign: "center" }}>
            Ou{" "}
            <a href={WA_LINK_DEMO} target="_blank" rel="noopener" className={styles.waFallbackLink}>
              fale agora no WhatsApp
            </a>
          </p>
        </div>
      </div>

      {/* Mini-mockup do painel executivo (representação da UI do sistema) */}
      <div
        style={{
          background: "#0e141d",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 40px 90px -40px rgba(0,0,0,0.9)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "13px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            background: "#111823",
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#c7d0dc" }}>Painel executivo</span>
          <span style={{ fontFamily: monoFont, fontSize: 11, color: "#6b7889" }}>agosto 2026</span>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 16 }}>
          <div className={styles.heroKpiGrid3} style={{ gap: 12 }}>
            <KpiCard label="Margem bruta" value="R$ 214.380" />
            <KpiCard label="Tempo de pátio" value="23 dias" />
            <KpiCard label="Vendas no mês" value="37" />
          </div>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: 18,
              background: "#111823",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 12.5, color: "#94a1b5" }}>Faturamento por semana</span>
              <span style={{ fontFamily: monoFont, fontSize: 12, color: "#f5a524" }}>+18%</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 104 }}>
              {[44, 61, 52, 78, 69, 96].map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    background: i >= 4 ? "#f5a524" : "rgba(245,165,36,0.28)",
                    borderRadius: "4px 4px 0 0",
                  }}
                />
              ))}
            </div>
          </div>
          <div className={styles.heroKpiGrid2} style={{ gap: 12 }}>
            <AlertCard icon="/icons/leads-alert.svg" label="Leads sem resposta" value="4" />
            <AlertCard icon="/icons/docs-alert.svg" label="Documentos a vencer" value="2" />
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 14, background: "#111823" }}>
      <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#94a1b5" }}>{label}</p>
      <p style={{ margin: 0, fontFamily: monoFont, fontSize: 21, fontWeight: 600 }}>{value}</p>
    </div>
  );
}

function AlertCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: 14,
        background: "#111823",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          flex: "0 0 18px",
          background: "#94a1b5",
          display: "block",
          WebkitMaskImage: `url(${icon})`,
          maskImage: `url(${icon})`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }}
      />
      <div>
        <p style={{ margin: 0, fontSize: 11.5, color: "#94a1b5" }}>{label}</p>
        <p style={{ margin: "2px 0 0", fontFamily: monoFont, fontSize: 15, fontWeight: 600 }}>{value}</p>
      </div>
    </div>
  );
}
