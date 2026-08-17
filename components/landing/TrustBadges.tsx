"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

const monoFont = "'Geist Mono', monospace";

/**
 * Os três selos e, atrás de cada um, o texto integral que antes ficava aberto
 * na página em três cards longos (~870px no desktop, ~1880px no mobile — mais
 * de dois telões só de política). O texto NÃO foi reescrito nem resumido: é o
 * mesmo conteúdo do bundle legado, movido para dentro de um modal de leitura.
 *
 * `id` é contrato público, não detalhe interno: o rodapé linka `#privacidade`,
 * `#termos` e `#lgpd` desde a primeira versão da landing, e esses anchors
 * continuam existindo — agora abrindo o modal correspondente em vez de rolar
 * até um card. Por isso o pareamento selo → política não é na ordem em que os
 * cards estavam: cada selo aponta para a política que de fato o sustenta.
 *
 * Os modais usam `<dialog>` nativo: foco preso dentro do modal, Escape,
 * `::backdrop` e devolução do foco ao elemento que abriu já vêm do navegador.
 * public/demo-modal.js precisou implementar tudo isso à mão (trap de Tab,
 * listener de Escape, devolução de foco) porque nasceu como script solto no
 * bundle; aqui não há motivo para repetir ~80 linhas de a11y que a plataforma
 * entrega de graça.
 */
const POLITICAS = [
  {
    id: "lgpd",
    icone: "/icons/trust-lgpd.svg",
    selo: "100% adequado à LGPD",
    resumo: "Seus dados e os de seus clientes pertencem apenas à sua loja.",
    titulo: "Tratamento de dados (LGPD)",
    paragrafos: [
      "Os dados pessoais de compradores e interessados registrados no CRM pertencem exclusivamente à revenda. Perante a Lei 13.709/2018, a loja é a controladora desses dados e o AutoGiro DMS atua como operador, tratando as informações apenas para executar as funções contratadas.",
      "Cabe à loja ter base legal para o cadastro e atender aos pedidos de titulares. O sistema oferece as ferramentas para isso: exportação, correção e exclusão de cadastros a qualquer momento.",
      "Ao encerrar a assinatura, a loja pode exportar toda a base. Os dados são eliminados dos nossos ambientes em até 90 dias, ressalvado o que a legislação fiscal obrigue a reter.",
    ],
  },
  {
    id: "privacidade",
    icone: "/icons/trust-seguranca.svg",
    selo: "Segurança bancária",
    resumo: "Servidores no Brasil, tráfego criptografado e backup diário.",
    titulo: "Política de privacidade",
    paragrafos: [
      "As informações comerciais da sua revenda são confidenciais. Preço de compra, margem por veículo, despesas de pátio, comissão de vendedor e carteira de clientes ficam visíveis apenas para os usuários da própria loja.",
      "Não vendemos, alugamos nem compartilhamos esses dados com terceiros, e não os usamos para alimentar bases de mercado ou comparativos entre lojas. O acesso da nossa equipe é restrito a chamados de suporte abertos por você, sempre registrado.",
      "Os bancos de dados ficam hospedados no Brasil, com backup diário e tráfego criptografado.",
    ],
  },
  {
    id: "termos",
    icone: "/icons/trust-contrato.svg",
    selo: "Sem letrinhas miúdas",
    resumo: "Assinatura mensal sem fidelidade. Os dados são seus.",
    titulo: "Termos de uso",
    paragrafos: [
      "O AutoGiro DMS é licenciado como software de gestão por assinatura mensal, sem fidelidade. A licença vale para a loja contratante e para os usuários que ela cadastrar, dentro do limite do plano vigente. Credenciais são pessoais e não devem ser compartilhadas.",
      "Trabalhamos com meta de disponibilidade de 99,5% ao mês, fora janelas de manutenção programada, comunicadas com antecedência. Integrações com portais, bancos e órgãos externos dependem da disponibilidade desses serviços.",
      "A responsabilidade pelo conteúdo lançado no sistema é da loja: valores, documentos fiscais, contratos e anúncios publicados. O sistema organiza e calcula sobre o que foi informado, e não substitui a conferência contábil e fiscal.",
    ],
  },
] as const;

type PoliticaId = (typeof POLITICAS)[number]["id"];

function ehPoliticaId(valor: string): valor is PoliticaId {
  return POLITICAS.some((p) => p.id === valor);
}

export function TrustBadges() {
  const [abertaId, setAbertaId] = useState<PoliticaId | null>(null);

  /*
   * O hash é o contrato com o rodapé — do mesmo jeito que `data-ag-demo` é o
   * contrato do modal de demonstração. Assim os links continuam sendo `<a
   * href="#lgpd">` puro, sem nenhum acoplamento com este componente, e
   * `autogirodms.com.br/#lgpd` compartilhado por fora abre direto a política.
   */
  useEffect(() => {
    const sincronizar = () => {
      const id = window.location.hash.slice(1);
      if (ehPoliticaId(id)) setAbertaId(id);
    };
    sincronizar();
    window.addEventListener("hashchange", sincronizar);
    return () => window.removeEventListener("hashchange", sincronizar);
  }, []);

  const fechar = useCallback(() => {
    setAbertaId((atual) => {
      /*
       * Sem limpar o hash, clicar duas vezes no mesmo link do rodapé não
       * reabriria o modal: a URL não muda, `hashchange` não dispara.
       * `replaceState` em vez de mexer em `location.hash` para não empilhar
       * histórico nem provocar um salto de rolagem.
       */
      if (atual && window.location.hash === `#${atual}`) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      return null;
    });
  }, []);

  return (
    <>
      <div className={styles.trustGrid}>
        {POLITICAS.map((p) => (
          <button
            key={p.id}
            type="button"
            id={p.id}
            className={styles.trustBadge}
            aria-haspopup="dialog"
            onClick={() => setAbertaId(p.id)}
          >
            <span
              aria-hidden="true"
              className={styles.trustIcon}
              style={{ WebkitMaskImage: `url(${p.icone})`, maskImage: `url(${p.icone})` }}
            />
            <span className={styles.trustSelo}>{p.selo}</span>
            <span className={styles.trustResumo}>{p.resumo}</span>
            {/* Rótulo fixo em vez do título da política: minúsculo destruía a
                sigla ("Ler tratamento de dados (lgpd)"), e o título com
                maiúscula no meio da frase destoava. Quem usa leitor de tela
                recebe o nome exato do documento no <span> abaixo. */}
            <span aria-hidden="true" className={styles.trustAcao}>
              Ler na íntegra
            </span>
            {/* O <button> anuncia só "100% adequado à LGPD" sem isto — o texto
                visível não diz que há um documento por trás. */}
            <span className={styles.visuallyHidden}>— abrir {p.titulo}</span>
          </button>
        ))}
      </div>

      {POLITICAS.map((p) => (
        <PoliticaDialog key={p.id} politica={p} aberta={abertaId === p.id} aoFechar={fechar} />
      ))}
    </>
  );
}

/**
 * Um `<dialog>` por política, todos sempre na árvore, em vez de um só com o
 * conteúdo trocado. O texto das três passa a existir no HTML que sai do
 * servidor — antes desta migração ele só aparecia depois que o bundle montava
 * via JavaScript, então nenhum crawler ou leitor de "modo leitura" enxergava
 * uma linha das políticas. Custa três nós ocultos e resolve isso.
 */
function PoliticaDialog({
  politica,
  aberta,
  aoFechar,
}: {
  politica: (typeof POLITICAS)[number];
  aberta: boolean;
  aoFechar: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = dialogRef.current;
    if (!dialogo) return;
    if (aberta && !dialogo.open) dialogo.showModal();
    if (!aberta && dialogo.open) dialogo.close();
  }, [aberta]);

  const tituloId = `trust-dialog-${politica.id}`;

  return (
    <dialog
      ref={dialogRef}
      className={styles.trustDialog}
      aria-labelledby={tituloId}
      onClose={aoFechar}
      onClick={(e) => {
        // Clique no ::backdrop reporta o próprio <dialog> como alvo; clique em
        // qualquer conteúdo reporta um descendente.
        if (e.target === dialogRef.current) aoFechar();
      }}
    >
      <div className={styles.trustDialogCorpo}>
        <div className={styles.trustDialogTopo}>
          <h3 id={tituloId} className={styles.trustDialogTitulo}>
            {politica.titulo}
          </h3>
          <button
            type="button"
            className={styles.trustDialogFechar}
            onClick={aoFechar}
            aria-label="Fechar"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className={styles.trustDialogTexto}>
          {politica.paragrafos.map((paragrafo) => (
            <p key={paragrafo.slice(0, 40)}>{paragrafo}</p>
          ))}
        </div>
        <p className={styles.trustDialogRodape} style={{ fontFamily: monoFont }}>
          Última atualização: agosto de 2026. A versão integral é entregue junto do contrato de
          assinatura.
        </p>
      </div>
    </dialog>
  );
}
