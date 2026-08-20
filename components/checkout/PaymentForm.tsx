"use client";

import { useEffect, useRef, useState } from "react";
import { PLANS, TRIAL_DAYS, type PlanId } from "@/lib/plans";
import { waLink } from "@/lib/whatsapp";
import styles from "./checkout.module.css";
import { IconCheck, IconCreditCard, IconLock, IconPix, IconWhatsApp } from "./icons";

/**
 * Área de pagamento do checkout, com duas abas: cartão de crédito (padrão) e
 * Pix. É a CASCA VISUAL: nenhum dado digitado sai do navegador. Não existe
 * fetch, não existe rota de API de pagamento, e o gateway (Asaas ou Pagar.me —
 * ver lib/checkout.ts) ainda não tem chave. Os dois caminhos terminam no mesmo
 * aviso, dizendo que a cobrança está sendo configurada e que um consultor
 * conclui pelo WhatsApp.
 *
 * A aba do Pix é um estado ilustrativo de propósito: gerar QR Code de verdade
 * exige o gateway (o payload do Pix é assinado por ele, não por nós), então em
 * vez de inventar um código que não paga nada, a tela mostra o lugar onde ele
 * vai nascer. O `<svg>` do QR é decorativo e desenhado por uma função
 * determinística — precisa dar o MESMO desenho no servidor e no cliente, ou o
 * React acusa divergência de hidratação.
 *
 * Por que validar de verdade um formulário que não processa nada: a validação
 * é o que faz a tela parecer (e ser) um checkout real para quem testa o funil
 * — e é o mesmo código que continua valendo quando o campo passar a ser
 * tokenizado pelo gateway. O que NÃO existe aqui, de propósito, é qualquer
 * armazenamento: nada de localStorage, nada de envio, nada que faça número de
 * cartão sobreviver ao unmount deste componente.
 */

const AUTO_DISMISS_MS = 12000;

interface Brand {
  name: string;
  /** Tamanhos de bloco do número, em dígitos. */
  groups: number[];
  maxDigits: number;
  cvvLength: number;
}

const DEFAULT_BRAND: Brand = { name: "Cartão", groups: [4, 4, 4, 4], maxDigits: 16, cvvLength: 3 };
const AMEX: Brand = { name: "Amex", groups: [4, 6, 5], maxDigits: 15, cvvLength: 4 };

/**
 * Bandeira só pelo prefixo — o suficiente para agrupar os dígitos, dizer
 * quantos números tem o CVV e dar o retorno visual de que o cartão foi
 * reconhecido. A validação de verdade é a do gateway, quando ele existir.
 */
function detectBrand(digits: string): Brand {
  if (/^3[47]/.test(digits)) return AMEX;
  if (/^4/.test(digits)) return { ...DEFAULT_BRAND, name: "Visa" };
  if (/^(5[1-5]|2[2-7])/.test(digits)) return { ...DEFAULT_BRAND, name: "Mastercard" };
  if (/^(4011|4312|4389|4514|4576|5041|5067|509|6277|6362|6363|650|6516|6550)/.test(digits)) {
    return { ...DEFAULT_BRAND, name: "Elo" };
  }
  if (/^(38|60)/.test(digits)) return { ...DEFAULT_BRAND, name: "Hipercard" };
  return DEFAULT_BRAND;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function groupDigits(digits: string, groups: number[]): string {
  const out: string[] = [];
  let rest = digits;
  for (const size of groups) {
    if (!rest) break;
    out.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  if (rest) out.push(rest);
  return out.join(" ");
}

/** Luhn — o mesmo dígito verificador que qualquer operadora confere. */
function luhnOk(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function maskExpiry(value: string): string {
  const d = onlyDigits(value).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

function expiryError(value: string): string {
  const d = onlyDigits(value);
  if (d.length !== 4) return "Use o formato MM/AA.";

  const month = Number(d.slice(0, 2));
  const year = 2000 + Number(d.slice(2));
  if (month < 1 || month > 12) return "Mês inválido.";

  const now = new Date();
  // Um cartão vale até o ÚLTIMO dia do mês impresso: comparar com o primeiro
  // dia do mês seguinte evita recusar um cartão que vence hoje.
  const expiresAfter = new Date(year, month, 1);
  if (expiresAfter <= new Date(now.getFullYear(), now.getMonth(), 1)) {
    return "Cartão vencido.";
  }
  return "";
}

type FieldName = "numero" | "titular" | "validade" | "cvv";

type Metodo = "cartao" | "pix";

const METODOS = [
  { id: "cartao", label: "Cartão de crédito", Icone: IconCreditCard },
  { id: "pix", label: "Pix", Icone: IconPix },
] as const satisfies readonly { id: Metodo; label: string; Icone: (p: { size?: number }) => React.ReactElement }[];

/** Módulos de um QR fictício: nada aqui codifica valor, chave ou payload. */
function QrIlustrativo() {
  const N = 21;
  const noFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);

  const modulos = [];
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      if (noFinder(x, y)) continue;
      if ((x * 7 + y * 13 + x * y * 3) % 11 < 5) {
        modulos.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
      }
    }
  }

  const finder = (x: number, y: number) => (
    <g key={`f${x}-${y}`}>
      <rect x={x + 0.5} y={y + 0.5} width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  );

  return (
    <svg viewBox="0 0 21 21" className={styles.pixQr} fill="currentColor" aria-hidden>
      {modulos}
      {[finder(0, 0), finder(14, 0), finder(0, 14)]}
    </svg>
  );
}

export function PaymentForm({ plan }: { plan: PlanId }) {
  const [metodo, setMetodo] = useState<Metodo>("cartao");
  const [numero, setNumero] = useState("");
  const [titular, setTitular] = useState("");
  const [validade, setValidade] = useState("");
  const [cvv, setCvv] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [avisoAberto, setAvisoAberto] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const digits = onlyDigits(numero);
  const brand = detectBrand(digits);

  useEffect(() => {
    const pendentes = timers.current;
    return () => {
      pendentes.forEach(clearTimeout);
    };
  }, []);

  function schedule(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms));
  }

  function clearError(field: FieldName) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
  }

  function validar(): boolean {
    const next: Partial<Record<FieldName, string>> = {};

    if (digits.length < 13 || digits.length > 19) {
      next.numero = "Informe os números do cartão.";
    } else if (!luhnOk(digits)) {
      next.numero = "Confira o número do cartão.";
    }
    if (titular.trim().length < 3) next.titular = "Informe o nome impresso no cartão.";

    const erroValidade = expiryError(validade);
    if (erroValidade) next.validade = erroValidade;

    const cvvDigits = onlyDigits(cvv);
    if (cvvDigits.length !== brand.cvvLength) {
      next.cvv = `O CVV tem ${brand.cvvLength} dígitos.`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /**
   * O desfecho dos DOIS métodos. Nenhuma requisição sai daqui: o tempo de
   * espera existe só para o botão não piscar. Quando o gateway entrar, é este
   * trecho que se divide — tokenizar o cartão de um lado, pedir o QR Code do
   * Pix do outro.
   */
  function simularEnvio() {
    if (enviando) return;
    setEnviando(true);
    schedule(() => {
      setEnviando(false);
      setAvisoAberto(true);
      schedule(() => setAvisoAberto(false), AUTO_DISMISS_MS);
    }, 700);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!validar()) return;
    simularEnvio();
  }

  /**
   * Setas navegam entre as abas e o Tab sai do grupo (roving tabindex) — é o
   * que o padrão de tabs da WAI-ARIA espera, e o que o <dialog> nativo das
   * políticas da landing entrega de graça mas aqui precisa ser escrito.
   */
  function onTabKeyDown(e: React.KeyboardEvent, indice: number) {
    const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const proximo = (indice + passo + METODOS.length) % METODOS.length;
    setMetodo(METODOS[proximo].id);
    tabsRef.current[proximo]?.focus();
  }

  const dados = PLANS[plan];
  const waConsultor = waLink(
    `Olá! Cheguei na tela de pagamento do AutoGiro DMS e quero liberar meus ${TRIAL_DAYS} dias grátis no plano ${dados.label}.`
  );

  return (
    <>
      <section className={`${styles.card} ${styles.payment}`} aria-labelledby="pagamento-titulo">
        <h2 className={styles.formTitle} id="pagamento-titulo">
          Forma de pagamento
        </h2>

        <div className={styles.tabs} role="tablist" aria-label="Forma de pagamento">
          {METODOS.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              id={`ck-tab-${m.id}`}
              aria-selected={metodo === m.id}
              aria-controls={`ck-painel-${m.id}`}
              tabIndex={metodo === m.id ? 0 : -1}
              ref={(el) => {
                tabsRef.current[i] = el;
              }}
              className={styles.tab}
              onClick={() => setMetodo(m.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
            >
              <m.Icone size={16} />
              {m.label}
            </button>
          ))}
        </div>

        {/* Os dois painéis ficam montados o tempo todo, escondidos por
            `hidden`: quem digitou meio cartão, espiou o Pix e voltou não
            perde o que já tinha preenchido. */}
        <div
          className={styles.panel}
          id="ck-painel-cartao"
          role="tabpanel"
          aria-labelledby="ck-tab-cartao"
          hidden={metodo !== "cartao"}
        >
          {/* Espelho do que está sendo digitado: confere de relance se o número
              e a validade batem com o cartão na mão. */}
          <div className={styles.cardPreview} aria-hidden>
            <div className={styles.cardChip} />
            <p className={styles.cardNumber}>
              {groupDigits(digits, brand.groups) || "•••• •••• •••• ••••"}
            </p>
            <div className={styles.cardMeta}>
              <div>
                <p className={styles.cardMetaLabel}>Titular</p>
                <p className={styles.cardMetaValue}>{titular || "NOME NO CARTÃO"}</p>
              </div>
              <div>
                <p className={styles.cardMetaLabel}>Validade</p>
                <p className={styles.cardMetaValue}>{validade || "MM/AA"}</p>
              </div>
              <span className={styles.cardBrand}>{brand.name}</span>
            </div>
          </div>

          <h3 className={styles.panelTitle}>Dados do cartão</h3>
          <p className={styles.formSub}>
            Usamos o cartão apenas para confirmar sua identidade e manter a assinatura
            ativa depois do teste. Nada é cobrado nos primeiros {TRIAL_DAYS} dias.
          </p>

          <form onSubmit={onSubmit} noValidate>
            <div className={`${styles.field} ${styles.fieldMono}`}>
              <label htmlFor="ck-numero">Número do cartão</label>
              <input
                id="ck-numero"
                name="cardnumber"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="0000 0000 0000 0000"
                value={groupDigits(digits, brand.groups)}
                aria-invalid={errors.numero ? true : undefined}
                aria-describedby="ck-err-numero"
                onChange={(e) => {
                  const proximos = onlyDigits(e.target.value).slice(0, brand.maxDigits);
                  setNumero(proximos);
                  clearError("numero");
                }}
              />
              <span className={styles.error} id="ck-err-numero" aria-live="polite">
                {errors.numero}
              </span>
            </div>

            <div className={styles.field}>
              <label htmlFor="ck-titular">Nome impresso no cartão</label>
              <input
                id="ck-titular"
                name="ccname"
                autoComplete="cc-name"
                placeholder="Como está escrito no cartão"
                value={titular}
                aria-invalid={errors.titular ? true : undefined}
                aria-describedby="ck-err-titular"
                onChange={(e) => {
                  setTitular(e.target.value.replace(/[^\p{L}\s.'-]/gu, ""));
                  clearError("titular");
                }}
              />
              <span className={styles.error} id="ck-err-titular" aria-live="polite">
                {errors.titular}
              </span>
            </div>

            <div className={styles.fieldRow}>
              <div className={`${styles.field} ${styles.fieldMono}`}>
                <label htmlFor="ck-validade">Validade</label>
                <input
                  id="ck-validade"
                  name="cc-exp"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="MM/AA"
                  value={validade}
                  aria-invalid={errors.validade ? true : undefined}
                  aria-describedby="ck-err-validade"
                  onChange={(e) => {
                    setValidade(maskExpiry(e.target.value));
                    clearError("validade");
                  }}
                />
                <span className={styles.error} id="ck-err-validade" aria-live="polite">
                  {errors.validade}
                </span>
              </div>

              <div className={`${styles.field} ${styles.fieldMono}`}>
                <label htmlFor="ck-cvv">CVV</label>
                <input
                  id="ck-cvv"
                  name="cvc"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder={brand.cvvLength === 4 ? "0000" : "000"}
                  value={cvv}
                  aria-invalid={errors.cvv ? true : undefined}
                  aria-describedby="ck-err-cvv"
                  onChange={(e) => {
                    setCvv(onlyDigits(e.target.value).slice(0, brand.cvvLength));
                    clearError("cvv");
                  }}
                />
                <span className={styles.error} id="ck-err-cvv" aria-live="polite">
                  {errors.cvv}
                </span>
              </div>
            </div>

            <button type="submit" className={styles.submit} disabled={enviando}>
              {enviando ? (
                "Confirmando..."
              ) : (
                <>
                  <IconLock size={16} />
                  Finalizar pagamento
                </>
              )}
            </button>

            <p className={styles.formLegal}>
              Conexão criptografada. Você pode cancelar dentro dos {TRIAL_DAYS} dias sem
              pagar nada.
            </p>
          </form>
        </div>

        <div
          className={styles.panel}
          id="ck-painel-pix"
          role="tabpanel"
          aria-labelledby="ck-tab-pix"
          hidden={metodo !== "pix"}
        >
          <div className={styles.pixBox}>
            <div className={styles.pixQrWrap}>
              <QrIlustrativo />
            </div>
            <p className={styles.pixTitle}>
              O QR Code do Pix será gerado na próxima etapa.
            </p>
            <p className={styles.pixText}>
              Nada é cobrado agora — são {TRIAL_DAYS} dias de teste antes da primeira
              cobrança. Ao gerar, você recebe o QR Code e o código copia e cola, e a
              confirmação do plano {dados.label} é na hora.
            </p>
          </div>

          <button
            type="button"
            className={styles.submit}
            onClick={simularEnvio}
            disabled={enviando}
          >
            {enviando ? (
              "Gerando..."
            ) : (
              <>
                <IconPix size={16} />
                Gerar Pix
              </>
            )}
          </button>

          <p className={styles.formLegal}>
            A confirmação é automática assim que o Pix é pago. Você pode cancelar
            dentro dos {TRIAL_DAYS} dias sem pagar nada.
          </p>
        </div>
      </section>

      {avisoAberto && (
        <div className={styles.toast} role="status" aria-live="polite">
          <span className={styles.toastIcon}>
            <IconCheck size={17} />
          </span>
          <div>
            <p className={styles.toastTitle}>Configuração de pagamento em andamento</p>
            <p className={styles.toastText}>
              Nosso consultor chamará no WhatsApp para liberar seu acesso ao plano{" "}
              {dados.label}. Nenhuma cobrança foi feita.
            </p>
            <a className={styles.toastAction} href={waConsultor} target="_blank" rel="noopener">
              <IconWhatsApp size={15} />
              Falar agora no WhatsApp
            </a>
          </div>
          <button
            type="button"
            className={styles.toastClose}
            onClick={() => setAvisoAberto(false)}
            aria-label="Fechar aviso"
          >
            &#10005;
          </button>
        </div>
      )}
    </>
  );
}
