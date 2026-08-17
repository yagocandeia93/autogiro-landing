import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";

/**
 * "/" deixou de ser um redirect para o HTML estático em public/index.html
 * (docs/STATUS.md, item 11 — "LCP depende de JavaScript"). Cabeçalho e Hero
 * agora são componentes React reais, renderizados no servidor: o HTML que
 * chega no primeiro byte já tem a headline, o subtítulo e o CTA da dobra
 * acima, sem esperar nenhum JavaScript rodar.
 *
 * O restante da página (Calculadora, Estoque, CRM, Portais, Planos, Legal,
 * Footer) ainda vem do bundle exportado do Claude Design — a Calculadora tem
 * estado reativo que não pode ser fatiado com segurança do resto do bundle
 * sem reescrever o runtime que o gera (ver o comentário grande no topo de
 * public/legacy-mount.js antes de tentar mexer nisso). #ag-legacy-root é o
 * ponto de montagem que public/legacy-mount.js preenche em runtime,
 * buscando o conteúdo de public/legacy-content.html.
 */
export default function Home() {
  return (
    <>
      <Header />
      <Hero />
      {/*
        dangerouslySetInnerHTML (vazio) + suppressHydrationWarning: sem isso,
        React trata os filhos deste nó como parte da própria árvore que
        hidrata — no primeiro reconcile depois que legacy-mount.js injeta
        conteúdo aqui via DOM puro, React vê "filhos que eu não gerei" e os
        apaga, entendendo como um mismatch de hidratação. Com
        dangerouslySetInnerHTML, os filhos deixam de ser algo que o React
        reconcilia; ele só compara a própria string (vazia, casa com o SSR),
        e as mutações do script externo sobrevivem.
      */}
      <div id="ag-legacy-root" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: "" }} />
      <script src="/legacy-mount.js" defer />
    </>
  );
}
