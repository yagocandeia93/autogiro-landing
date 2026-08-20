import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PLANS, TRIAL_DAYS, parsePlan } from "@/lib/plans";
import { PaymentForm } from "@/components/checkout/PaymentForm";
import styles from "@/components/checkout/checkout.module.css";
import {
  IconArrowLeft,
  IconCheck,
  IconClock,
  IconGift,
  IconLock,
  IconShield,
} from "@/components/checkout/icons";

/**
 * Passo seguinte ao modal de assinatura da landing: public/lead-modal.js
 * redireciona para cá com `?plano=BASICO|PRO` (e o e-mail, que é a chave do
 * lead no Redis) assim que /api/signup-intent responde 200. Antes desta tela o
 * funil terminava dentro do próprio modal, com a janela se fechando sozinha.
 *
 * ESTA PÁGINA NÃO COBRA NINGUÉM. É a interface do checkout — resumo do pedido,
 * formulário de cartão e prova de segurança — construída antes do gateway
 * (Asaas/Pagar.me, ver lib/checkout.ts) para que a jornada não pare no ar. O
 * envio do formulário só abre um aviso dizendo que a cobrança está sendo
 * configurada e que um consultor conclui pelo WhatsApp; o componente que
 * cuida disso (components/checkout/PaymentForm.tsx) é o único trecho 'use
 * client' aqui, porque é o único com estado. Resumo, selos e cabeçalho são
 * SSR puro — chegam pintados no primeiro byte, como no Hero da landing.
 *
 * Quando a chave do gateway existir, o que muda é o `onSubmit` do formulário
 * (tokenizar o cartão e chamar a cobrança). Nada do layout precisa mudar.
 */

export const metadata: Metadata = {
  title: "Checkout | AutoGiro DMS",
  description:
    "Conclua a ativação da sua assinatura do AutoGiro DMS com 7 dias grátis.",
  // Etapa intermediária de funil, sem conteúdo indexável — o mesmo motivo que
  // já mantinha /checkout fora de public/sitemap.xml e do robots.txt.
  robots: { index: false, follow: false },
};

const GARANTIAS = [
  { icone: <IconLock size={14} />, texto: "Dados do cartão trafegam criptografados" },
  { icone: <IconShield size={14} />, texto: "Servidores no Brasil e adequação à LGPD" },
  { icone: <IconClock size={14} />, texto: "Sem fidelidade: cancele quando quiser" },
];

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const plan = parsePlan(params.plano);
  const dados = PLANS[plan];

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden />

      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.brand}>
            {/* alt vazio de propósito: o nome da marca vem escrito ao lado, e
                repeti-lo faria o leitor de tela anunciar "AutoGiro DMS" duas
                vezes seguidas no mesmo link. */}
            <Image
              src="/Logo.png"
              alt=""
              width={26}
              height={26}
              className={styles.brandMark}
              priority
            />
            <span className={styles.brandName}>AutoGiro DMS</span>
          </Link>
          <span className={styles.secureTag}>
            <IconLock size={14} />
            Ambiente de pagamento seguro
          </span>
        </header>

        <div className={styles.grid}>
          {/* ── resumo do pedido ─────────────────────────────────────── */}
          <section className={`${styles.card} ${styles.summary}`} aria-labelledby="resumo-titulo">
            <p className={styles.eyebrow} id="resumo-titulo">
              Resumo do pedido
            </p>

            <div className={styles.planHead}>
              <h1 className={styles.planName}>Plano {dados.label}</h1>
              <span className={styles.planPrice}>
                {dados.priceLabel}
                <span> /mês</span>
              </span>
            </div>
            <p className={styles.planTagline}>{dados.tagline}</p>

            <div className={styles.trial}>
              <IconGift size={18} />
              <p className={styles.trialText}>
                {TRIAL_DAYS} dias grátis, cancele quando quiser.
                <small>
                  A cobrança só começa depois do teste — e não existe taxa de setup.
                </small>
              </p>
            </div>

            <div className={styles.divider} />

            <div className={`${styles.row} ${styles.rowTotal}`}>
              <span className={styles.rowLabel}>Você paga hoje</span>
              <span className={styles.rowValue}>R$ 0,00</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>
                Depois dos {TRIAL_DAYS} dias de teste
              </span>
              <span className={styles.rowValue}>{dados.priceLabel}/mês</span>
            </div>

            <div className={styles.divider} />

            <ul className={styles.featureList}>
              {dados.highlights.map((item) => (
                <li key={item} className={styles.feature}>
                  {item.endsWith(":") ? (
                    <span className={styles.featureLead}>{item}</span>
                  ) : (
                    <>
                      <IconCheck size={14} />
                      {item}
                    </>
                  )}
                </li>
              ))}
            </ul>

            <div className={styles.divider} />

            <ul className={styles.trustList}>
              {GARANTIAS.map((g) => (
                <li key={g.texto} className={styles.trustItem}>
                  {g.icone}
                  {g.texto}
                </li>
              ))}
            </ul>
          </section>

          {/* ── pagamento ────────────────────────────────────────────── */}
          <PaymentForm plan={plan} />
        </div>

        <Link href="/#planos" className={styles.backLink}>
          <IconArrowLeft size={15} />
          Voltar para os planos
        </Link>
      </div>
    </main>
  );
}
