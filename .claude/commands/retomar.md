---
description: Carrega o contexto do autogiro-landing para continuar o trabalho numa janela nova
---

Você está retomando o trabalho no `autogiro-landing` numa sessão nova. Este
arquivo é o resumo do que já foi construído e do que dói se for ignorado — leia
antes de mexer em qualquer coisa, e confirme o estado real do repositório antes
de agir (`git log --oneline -8`, `git status`), porque o texto abaixo envelhece.

Se não houver pedido junto do `/retomar`, apenas confirme o estado do repositório
e pergunte o que fazer. Não saia mexendo em nada por conta própria.

## O que é

Landing comercial do AutoGiro DMS (`autogirodms.com.br`, Vercel). É separada do
app principal (`app.autogirodms.com.br`, Railway) de propósito: a área de vendas
evolui sem tocar na produção. Next 15 App Router, React 19, TypeScript, CSS
Modules. **Não tem Tailwind e não tem suíte de testes** — o CI (`.github/
workflows/ci.yml`) roda `npm ci`, `npm run lint`, `npx tsc --noEmit` e
`npm run build`, e é só isso.

## A armadilha principal: a landing é híbrida

Só as bordas da página são React de verdade (`app/page.tsx` +
`components/landing/{Header,Hero,Legal,Footer,TrustBadges}.tsx`, com
`landing.module.css`). **Todo o miolo — Calculadora, Estoque, CRM, Portais e a
seção de Planos — vem do bundle exportado do Claude Design**: o HTML real mora
dentro de uma string JSON em `<script type="__bundler/template">` em
`public/legacy-content.html`, e `public/legacy-mount.js` monta isso em runtime
dentro de `#ag-legacy-root`.

Duas consequências práticas:

- **Editar o bundle exige casar as formas escapadas.** No arquivo bruto as aspas
  são `\"`, `</a>` aparece como `<\/a>` e as quebras de linha são `\n`. Um
  `grep '>Assinar agora</a>'` devolve zero e engana. Edite com Python, com
  `assert count == 1` antes de cada substituição, e reparse com `json.loads` no
  fim para provar que o template continua válido.
- **Não fatie o bundle sem ler o comentário no topo de `legacy-mount.js`.** A
  Calculadora tem estado reativo e re-renderiza a subárvore inteira a cada
  `setState`, o que mataria qualquer listener preso num botão lá dentro.
- **O runtime do bundle injeta CSS global que não existe como texto no repo**:
  `html,body{height:100%;margin:0}` mais regras em `#dc-root`. Nenhum `grep`
  encontra — é o script minificado que monta a folha em runtime. Foi o que
  matou o `sticky` do Header (ver `docs/STATUS.md`, 4.4). Para depurar estilo
  global que "não vem de lugar nenhum", use o CDP
  (`CSS.getMatchedStylesForNode` + `CSS.getStyleSheetText`), não o grep.

`public/lead-modal.js` é JS estático servido de `public/`, **fora da árvore de
módulos do Next** — não há router para importar, daí o `window.location.assign`
no redirect e a `/api/turnstile-config` para entregar a site key em runtime. Ele
captura clique por delegação no `document` (sobrevive aos re-renders do bundle)
e é anexado ao `document.body`, fora do `<x-dc>`. O contrato com o resto é um
atributo só: `data-ag-signup="BASICO|PRO"` nos botões de plano e `data-ag-demo`
nos CTAs de demonstração.

## Paleta e tokens (Dark Mode)

Fundo `#0a0e14`; superfícies `#0e141d` e `#111823`. Texto `#e9edf3`, apoios
`#c7d0dc` / `#94a1b5` / `#7c8899` / `#6b7889` / `#b3bdcc`. Âmbar `#f5a524`
(hover `#ffb640`, texto sobre âmbar `#1b1305`); erro `#f87171`; verde de
confirmação `#6ee7a8`. Bordas `rgba(255,255,255,.09)` a `.16`. Fontes `Geist` e
`Geist Mono`, self-hosted em `public/fonts/*.woff2` com `@font-face` em
`app/globals.css`. Raio **10px** em controles e **14px** em cards. Inputs:
fundo `#0a0e14`, borda `rgba(255,255,255,.14)`, foco `border-color:#f5a524` +
`box-shadow:0 0 0 3px rgba(245,165,36,.15)`.

A marca é `public/Logo.png` (256×256, transparente), servida por `next/image`
nas três telas — cabeçalho e rodapé da landing e cabeçalho do checkout.
O ícone genérico que ela substituiu (`public/icons/logo-mark.svg`, o `rotate-3d`
do Lucide) foi deletado em 21/08. Ele era um traçado `stroke="currentColor"`, que
dentro de um `<img>` renderiza preto — foi exatamente esse o bug da logo
invisível; se ressuscitar esse padrão em algum lugar, o sintoma é esse.

## O funil, hoje

1. Qualquer CTA abre o **mesmo modal** (`public/lead-modal.js`), que captura
   nome, e-mail, WhatsApp e loja. O plano vem do botão clicado.
2. `POST /api/signup-intent` é o **Muro 3**: rate limit por IP (Upstash),
   Turnstile server-side e validação. Avisa a equipe pelo Resend e, no funil de
   assinatura, grava `signup-lead:{email}` no Redis com TTL de 7 dias
   (`lib/leadStore.ts`) — o e-mail é a chave que o webhook usará depois.
3. Depois do 200 OK os funis se separam: demonstração fecha a janela; **plano
   redireciona para `/checkout?plano=BASICO|PRO`**. O timer do redirect é
   separado do auto-close de propósito — fechar a janela não pode cancelar a
   navegação de quem já enviou os dados —, e o painel de sucesso mostra um link
   explícito caso o redirect automático seja bloqueado.
4. `/checkout` (`app/checkout/page.tsx` + `components/checkout/*`) é a
   **interface** do pagamento: resumo do pedido à esquerda e, à direita, duas
   abas — Cartão de crédito (padrão, com validação de Luhn, validade e CVV por
   bandeira) e Pix (estado ilustrativo, QR desfocado). **Nenhuma das duas cobra
   ninguém**: as duas terminam num aviso dizendo que a cobrança está sendo
   configurada e que o consultor conclui pelo WhatsApp. Não existe requisição de
   pagamento em lugar nenhum, e isso é intencional — não ligue gateway sem
   pedido explícito.

`lib/plans.ts` é a fonte única de nome, preço e itens dos planos do lado
TypeScript. Os textos em `public/` seguem com cópia própria por serem estáticos,
fora da árvore de módulos do Next.

## Rodando e validando

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint         # deve dar 0 erros; 5 avisos são pré-existentes
npx tsc --noEmit
npm run build
```

Sem `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY` ou Upstash, tudo degrada para
memória/aviso no console em dev — dá para percorrer o funil inteiro localmente.
Em produção as três faltando derrubam a rota, de propósito.

**Validação em navegador de verdade**, que é o que pega os problemas de layout:
o Chromium já está instalado em `/opt/pw-browsers/chromium-1194/chrome-linux/
chrome`. Instale `playwright-core` **no scratchpad, nunca no repositório**
(`npm i playwright-core` numa pasta fora daqui) e aponte `executablePath` para
esse caminho — não rode `playwright install` e não suje o `package.json`.
Escreva o roteiro como uma lista de checks que imprime PASS/FAIL e conta o
total; foi assim que os degraus de alinhamento e a logo preta apareceram.
Confira sempre 390px e 360px de largura, e um `pageerror`/`console.error` zerado
(pega divergência de hidratação).

## Convenções

- **Tudo em português**: comentários, mensagens de commit, corpo de PR.
- Comentário explica **por quê**, não o quê. Os arquivos deste repo carregam o
  motivo das decisões estranhas; mantenha esse padrão em vez de descrever o
  código linha a linha.
- Trabalhe na branch designada da sessão. Se a PR anterior já foi mergeada,
  recomece a branch a partir da `main` (`git fetch origin main && git checkout
  -B <branch> origin/main`) em vez de empilhar em cima de histórico mergeado.
- **Não abra PR sem o usuário pedir.**

## Pontos em aberto

- **A ponte com o app principal não existe.** Depois que um pagamento for
  confirmado, algo precisa criar a loja de verdade (organização + admin +
  `CompanySettings`) no banco do AutoGiro, que roda no Railway. Hoje isso é
  `npm run onboard:loja`, rodado à mão. Virar isso num endpoint interno é
  decisão de RBAC e precisa de `/plan` próprio **no outro repositório** antes de
  sair do papel — `triggerProvisioning()` no webhook só imprime um log.
- **As âncoras do menu passam por baixo do Header.** Desde que a fixação no topo
  voltou (21/08), os links do menu (`#calculadora`, `#estoque`, `#crm`,
  `#portais`, `#planos`) rolam com 68px de cabeçalho ocupando o topo, então o
  título da seção de destino pode ficar parcialmente encoberto. A correção é
  `scroll-margin-top` nas seções-alvo, **não** no Header — mexer no Header
  mudaria o layout do menu. Cuidado: as seções do miolo moram no bundle
  (`public/legacy-content.html`), então a regra precisa vir de `app/globals.css`
  por seletor de id, não de um style inline dentro do bundle.
- **O resumo do checkout deixou de ser `position: sticky`** para as duas colunas
  terminarem na mesma linha. É reversível numa linha de
  `components/checkout/checkout.module.css` se a rolagem incomodar mais que o
  degrau incomodava.
- **TTL de 7 dias do `signup-lead`** foi calibrado para um funil em que o
  consultor liga em até 1 dia útil. Reavaliar quando o tempo real entre contato
  e pagamento for conhecido.
- **`AutoGiro-DMS-Landing-Page.html.bak`** na raiz é cópia de trabalho do upload
  original, já no `.gitignore`.

Contexto mais longo: `README.md` e `docs/STATUS.md`, que estão atualizados.
