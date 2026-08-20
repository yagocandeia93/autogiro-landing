# Landing Page AutoGiro DMS — Status pós-correções

**Repositório:** `yagocandeia93/autogiro-landing`
**Produção:** `autogirodms.com.br` (Vercel) — separado do app principal `app.autogirodms.com.br` (Railway)
**Data:** 16 de agosto de 2026 — *atualizado em 18 de agosto de 2026 (seções 3, 4.2, 6 e 7)*
**Referência:** atualiza o documento *Análise Técnica e Comercial — Landing Page AutoGiro DMS*

---

## 1. Resumo executivo

Dos 6 gargalos apontados na análise original, **4 foram resolvidos**, 1 foi parcialmente endereçado e 1 permanece aberto. Além disso, foi descoberto e corrigido um problema que a análise não tinha detectado: **o projeto na Vercel não estava sendo construído como aplicação Next.js**, o que fazia toda rota React e de API responder 404 em produção — inclusive as que já existiam antes destas mudanças.

| # | Gargalo original | Situação |
|---|---|---|
| 1 | CTA principal quebrado (`setTimeout` falso) | ✅ Resolvido |
| 2 | Nenhuma notificação de novo lead | ✅ Resolvido |
| 3 | Funil de pagamento incompleto | ❌ Aberto — UI de `/checkout` pronta (20/08), gateway ainda sem chave |
| 4 | Prova social ausente ou fictícia | ⚠️ Parcial — a fictícia foi removida; não há prova social real |
| 5 | SEO estruturalmente comprometido | ✅ Resolvido (title, description, OG, favicon, canonical) |
| 6 | Formulário duplicado e ambíguo | ✅ Resolvido — o decorativo deixou de existir |
| — | *(não previsto)* Deploy não construía o Next | ✅ Resolvido |

**Entregue em:** PR #1, mergeada em `main` (`ea18c98`), com 4 commits — `5a43d38`, `e7e8f48`, `b041218`, `76dae4e`.

**Sprint seguinte (17/08), PR #3 (`a4d70c4`):** fechou os itens **4 a 9** da seção 6 — segundo aviso de lead em `/api/verify-otp`, TTL do `verified-lead` de 30 min para 24 h, "Nome da loja" obrigatório também em `/inscricao`, `robots.txt` e `sitemap.xml`, `npm run lint` funcionando e CI em Pull Requests. Detalhe de cada um em [Resolvidos](#-resolvidos--17-de-agosto-de-2026).

**Sprint seguinte (17/08, mesmo dia), branch `claude/autogiro-cleanup-seo-backend-mwgm6p`, aguardando revisão/merge:** fechou os itens **10 a 12** — Cabeçalho e Hero migraram para componentes React reais e SSR'd, fontes saíram do base64 embutido para arquivos `.woff2` cacheáveis. Detalhe de cada um, incluindo o porquê de a Calculadora e o restante da página **não** terem seguido junto, em [Resolvidos](#-resolvidos--17-de-agosto-de-2026-2).

**Sprint de 18/08, branch `claude/subscription-funnel-refactor-rpiawy`:** mudança de estratégia de conversão, não correção de bug. O funil de assinatura deixou de ter página própria e verificação por código de e-mail: **os dois funis agora terminam no mesmo modal, sobre a landing, com o Turnstile como única barreira**. Detalhe em [Resolvidos](#-resolvidos--18-de-agosto-de-2026).

---

## 2. O que foi corrigido

### 2.1 CTA principal — de formulário falso a modal funcional

**O problema.** Eram **5** ocorrências (não 4, como a análise estimava): header, hero, calculadora, faixa final e footer. Todas apontavam para `#demo`, um formulário cujo `submit` era:

```js
this.timer = setTimeout(() => this.setState({ status: 'sent' }), 900);
```

Nenhuma chamada de rede. Nome, WhatsApp e faixa de estoque digitados eram descartados, e a pessoa via "Pedido registrado" achando que um consultor retornaria.

**A correção, em duas etapas.** Primeiro os CTAs passaram a apontar para `/inscricao`, o funil real. Depois, por mudança de estratégia de conversão, passaram a abrir um **modal sobre a própria landing** — sem tirar o visitante da página.

*(18/08: os botões de plano — "Assinar agora" e "Começar agora" — seguiram o mesmo caminho. Abrem o mesmo modal, com o plano vindo do botão clicado; `/inscricao` deixou de existir.)*

O modal tem 4 campos obrigatórios: **Nome, E-mail, WhatsApp** (com máscara brasileira) e **Nome da loja**. Erro por campo, `aria-invalid`, limpeza ao corrigir, estado de `loading` no botão, mensagem de sucesso dentro do modal e fechamento automático em 5 s. Também: Escape, clique no backdrop, trava de scroll, foco inicial no primeiro campo, devolução de foco ao gatilho e trap de Tab.

Foram removidos o formulário decorativo, o estado de envio falso, o timer e a tela de sucesso mentirosa.

### 2.2 Notificação de novo lead

`/api/signup-intent` passou a disparar um e-mail para a equipe via Resend assim que o lead vence o rate limit e o Turnstile — **antes** de qualquer confirmação de código. Quem desiste na tela do OTP é justamente o lead que vale uma ligação, e antes ele sumia junto com o TTL de 15 min do Redis.

O e-mail traz nome, loja, e-mail, WhatsApp, o interesse (demonstração ou plano) e um **botão de WhatsApp com a primeira mensagem já escrita**. O `replyTo` é o próprio lead. Destinatário configurável por `LEAD_NOTIFICATION_EMAIL`.

**Decisão de projeto:** o fluxo de demonstração **não gera OTP**. Mandar "seu código de verificação" para quem pediu uma ligação é confuso, e não existe cadastro a confirmar. Como consequência, o e-mail de aviso é o **único registro** desse lead — e por isso, e só nesse fluxo, uma falha no envio virou erro para quem preencheu.

*(18/08: o OTP saiu do funil inteiro, então essa distinção acabou. Não existe mais etapa nenhuma depois do envio, nos dois funis — o aviso virou o entregável dos dois, e uma falha dele derruba a resposta em ambos.)*

### 2.3 SEO e Open Graph

O `<title>` era literalmente **"Bundled Page"**. Agora: título comercial, `meta description`, `canonical`, Open Graph completo, Twitter Card e favicon gerado a partir da logomarca (`.ico` 16/32/48, PNGs 32/192/512 e apple-touch 180).

**Detalhe que não é opcional:** as tags entram em **dois lugares**. No `<head>` estático — que é o que crawler e WhatsApp leem, sem executar JS — e também no `<head>` do template do bundle, porque o runtime executa `document.documentElement.replaceWith(...)` e apagaria as primeiras. `og:image:width/height` estão declarados, que é o que faz o WhatsApp renderizar o card grande em vez da miniatura quadrada.

### 2.4 Compliance — métricas fictícias removidas

A faixa com **"+31% giro"** e **"R$ 42M em estoque gerido"** tinha no próprio código-fonte o aviso *"Números de demonstração. Substituir pelos indicadores reais da operação antes de publicar."* Publicar isso como resultado real é risco de publicidade enganosa (CDC, Art. 37, §1º).

A seção foi removida do HTML, e a **calculadora de giro subiu para esse espaço**, logo abaixo do hero — trocando dado inventado por uma mecânica de conversão que usa os números do próprio visitante.

Também removidas, a pedido: a seção **"Relatórios"** (da página, do menu e do footer) e a faixa final **"Trinta minutos com um consultor"**.

### 2.5 WhatsApp

Número atualizado para **+55 83 92149-1832**, com mensagem padronizada por origem do clique — consultor (header), demonstração (hero e CTA) e suporte (footer) — para a equipe saber de onde o contato veio na primeira linha da conversa.

### 2.6 Deploy — o bloqueio que a análise não viu

Descoberto durante a validação: `/inscricao`, `/checkout` e todas as rotas `/api/*` respondiam **404 com `x-vercel-error: NOT_FOUND`** em produção, o 404 de plataforma que a Vercel devolve quando não existe rota nem função para o caminho.

Duas evidências fecharam o diagnóstico: um GET numa rota que só aceita POST devolveria **405** se o Next estivesse rodando; e o `index.html` publicado era byte a byte o blob da `main`, provando que a Vercel publicava o repositório mas não o construía. O projeto servia apenas `public/` como site estático — coerente com o histórico, já que os primeiros commits eram um HTML solto e a estrutura Next entrou depois, sem trocar a configuração do projeto.

**Consequência importante:** nenhuma rota React ou de API jamais funcionou em produção, **incluindo os botões de plano**, que a análise original descreveu como "o único caminho que funciona de verdade".

Corrigido com `vercel.json` declarando `"framework": "nextjs"` mais ajuste no painel da Vercel. Depois disso, as variáveis de ambiente (que nunca tinham sido configuradas, porque até então nenhuma rota as alcançava) foram aplicadas.

---

## 3. Como a página está hoje

**Ordem das seções:** Header → Hero → **Calculadora** → Estoque → CRM → Portais → Planos → Legal → Footer.

Menu reordenado para seguir a ordem real da página: Calculadora / Estoque / CRM / Portais / Planos.

**Dois caminhos de conversão, ambos funcionais:**

| Caminho | Gatilho | Fluxo |
|---|---|---|
| Demonstração | 4 CTAs (header, hero, calculadora, footer), `data-ag-demo` | Modal → `POST /api/signup-intent` com `origem=demonstracao` → e-mail para a equipe |
| Assinatura | "Testar 7 dias grátis" / "Começar 7 dias grátis", `data-ag-signup="BASICO\|PRO"` | **Mesmo modal** → `POST /api/signup-intent` com `origem=plano` + `plan` → lead no Redis + e-mail para a equipe → **redirect para `/checkout?plano=…`** → consultor fecha a assinatura |

O caminho de assinatura passava por `/inscricao?plano=…` e por um código de 6 dígitos por e-mail antes de chegar a `/checkout` *(placeholder)*. Os dois passos saíram em 18/08 — a cobrança segue dependendo do gateway (item 1 da seção 6), mas agora nada mais separa o clique no plano do lead chegando à equipe.

*(20/08: o modal deixou de ser o fim da linha no caminho de assinatura. Depois do 200 OK ele redireciona para `/checkout?plano=BASICO|PRO`, que agora é uma tela de verdade — resumo do pedido, formulário de cartão e selos de segurança — em vez do cartão de aviso que existia ali. Continua sem cobrar: o envio abre um aviso dizendo que a cobrança está sendo configurada e que o consultor conclui pelo WhatsApp. Junto veio o gatilho de 7 dias grátis nos botões de plano, na legenda abaixo deles e no texto do modal.)*

---

## 4. Notas de arquitetura (leia antes de mexer)

### 4.1 O bundle é uma string JSON

O HTML real da landing mora dentro de `<script type="__bundler/template">` em `public/index.html`, como uma string JSON. Editar exige decodificar, alterar o HTML de verdade e re-serializar.

**Armadilha:** o exportador escapa **toda** barra como `\/`, não apenas a de `</`. Um `JSON.stringify` ingênuo produz um arquivo diferente do original. O patch usado valida, antes de gravar, que o round-trip decode→encode é **byte a byte idêntico** ao original, e cada substituição aborta se o trecho esperado não existir ou não for único. O blob de fontes e ícones em base64 permaneceu intacto.

### 4.2 Por que o modal vive fora do bundle

A lógica do modal está em **`public/lead-modal.js`** (até 18/08, `demo-modal.js`), um arquivo normal — legível, revisável e lintável. O bundle só ganhou `data-ag-demo` nos CTAs de demonstração, `data-ag-signup` nos dois botões de plano e uma tag `<script>`.

Duas decisões vêm de como o bundle funciona, e ambas são obrigatórias:

1. **O clique é capturado por delegação no `document`**, não por listener nos botões. O componente DCLogic re-renderiza a própria subárvore a cada `setState` — mexer nos sliders da calculadora já faz isso —, o que descartaria listeners presos nos elementos.
2. **O modal é anexado ao `document.body`, fora de `<x-dc>`.** Dentro, um re-render o apagaria no meio do preenchimento.

### 4.3 Turnstile na landing estática

A landing é servida estática, sem build do Next, então **não recebe `NEXT_PUBLIC_TURNSTILE_SITE_KEY` inlinada** como um componente React recebe. Foi criada a rota **`/api/turnstile-config`**, que entrega a site key em runtime. Expor isso não é risco: a site key é pública por definição; o que protege o funil é a `TURNSTILE_SECRET_KEY`, que fica só no servidor.

Em `lib/turnstile.ts`, a checagem da secret passou para **antes** da checagem do token: em dev sem Turnstile o widget não renderiza e não existe token, o que tornava o formulário impossível de testar localmente. Produção não afrouxa — sem a secret a função lança, então o caminho real sempre exige token e verificação no Cloudflare.

---

## 5. Validação executada

### 5.1 Navegador real (local) — 40 asserções

Modal dirigido de ponta a ponta com Playwright em Chromium: abertura pelos 4 CTAs, validação de vazio e de formato, máscara de telefone, estado de loading, payload enviado, sucesso, fechamento automático, reabertura limpa, Escape, backdrop, **sobrevivência ao re-render da calculadora**, 390×844 sem scroll horizontal e ausência de erros de console.

**Isso pegou 3 bugs antes do commit**, todos com a mesma causa raiz — `display` do autor vencendo o atributo `hidden`:

- **O overlay fechado cobria a página e engolia todo clique do site.** A landing ficava inutilizável depois de fechar o modal uma vez.
- O painel de sucesso vazava visível embaixo do formulário.
- O botão de submit nascia sem rótulo.

### 5.2 Produção — cerca de 30 requisições reais

| Verificação | Resultado |
|---|---|
| `GET /api/signup-intent` | **405** — app Next rodando |
| Corpo inválido | **400 missing_fields** — Upstash configurado |
| Rate limit (20 requisições) | **12× 429** com `Retry-After` |
| `X-Forwarded-For` forjado | não contornou — a Vercel sobrescreve com o IP real |
| Sem token / token forjado | **400 turnstile_failed** |
| `index.html` e `demo-modal.js` *(hoje `lead-modal.js`)* | **byte a byte** iguais aos testados no navegador |
| `/inscricao`, `/checkout`, `/og-image.png`, `/favicon.ico` | 200 *(`/inscricao` hoje é 308 → `/#planos`)* |

### 5.3 Fluxo completo com token real

Um envio real na landing produziu o e-mail de notificação, confirmado na caixa da equipe: remetente `contato@autogirodms.com.br`, assunto **"Pedido de demonstração: Yan Candeia — Yan Veículos"**, com nome, loja, e-mail, WhatsApp e "Demonstração — não escolheu plano".

Isso prova as duas coisas que não eram verificáveis por fora: que a `TURNSTILE_SECRET_KEY` casa com a site key (um token legítimo foi aceito) e que o Resend entrega.

### 5.4 Limitações do que foi testado

- **Nenhum teste automatizado ficou no repositório.** A suíte Playwright rodou fora do projeto, para não adicionar dependências não pedidas. *(Atualização de 17/08: já existe CI — `.github/workflows/ci.yml` roda lint, `tsc` e build a cada PR. Mas ela não substitui o que falta aqui: sem testes versionados, uma regressão de comportamento no modal continua passando batido.)*
- **O e-mail foi validado em um cliente (Gmail).** Outros clientes renderizam HTML de e-mail de forma diferente.
- **Um único envio real** validou o caminho de sucesso; não houve teste de carga.

---

## 6. O que falta

> **Atualização de 17/08:** os itens **4 a 9** — toda a faixa de prioridade média, mais as duas primeiras dívidas técnicas — foram resolvidos no commit `a4d70c4` (PR #3). Saíram das listas abaixo e estão registrados em [Resolvidos](#-resolvidos--17-de-agosto-de-2026), no fim da seção. A numeração original foi mantida para não quebrar a referência com a versão anterior deste documento.
>
> **Atualização de 17/08 (mesmo dia):** os itens **10 a 12** também saíram — Cabeçalho/Hero migrados para React real e SSR'd, fontes deixaram de ir embutidas em base64. Ver [Resolvidos](#-resolvidos--17-de-agosto-de-2026-2).

### Prioridade alta — destrava receita

1. **Fechar o gateway de pagamento.** `/checkout` já é a tela completa (resumo do pedido, formulário de cartão, selos), mas **não cobra**: o envio só abre o aviso de que a cobrança está sendo configurada. Nenhuma assinatura fecha pelo site — o caminho até a receita ainda depende de passo manual. A estrutura está pronta em `lib/checkout.ts` e `lib/webhookSignature.ts` (Asaas ou Pagar.me), esperando chave de API; do lado do front, o que muda é o `onSubmit` de `components/checkout/PaymentForm.tsx`.
2. **Analytics e pixel de conversão.** Não há GA4, Meta Pixel ou similar. Acabamos de ligar dois funis e **não há como medir a conversão de nenhum dos dois** — nem taxa de abertura do modal, nem abandono por campo. Isso deveria vir antes de qualquer investimento em tráfego pago.
3. **Prova social real.** A única que existia era a faixa fictícia, removida. Um depoimento bem contado, um print de resultado ou um logo de cliente supera quatro métricas inventadas. Hoje a página não tem nenhum.

### Prioridade média — reduz perda de lead

*Vazia — os itens 4 a 7 foram resolvidos. Ver [Resolvidos](#-resolvidos--17-de-agosto-de-2026).*

### Prioridade baixa — dívida técnica

*Vazia — os itens 10 a 12 foram resolvidos; o 13 nunca teve nada pra resolver aqui (ver abaixo). Ver [Resolvidos](#-resolvidos--17-de-agosto-de-2026-2).*

### ✅ Resolvidos — 17 de agosto de 2026

Todos no commit `a4d70c4` (PR #3). Validados com `npm run lint`, `npx tsc --noEmit` e `npm run build` passando, mais o funil exercitado ponta a ponta contra o servidor de desenvolvimento.

4. ✅ **Notificar também em `/api/verify-otp`** — Resolvido. A rota dispara um segundo e-mail quando o código confere. `lib/resend.ts` ganhou um `sendLeadNotice(lead, stage)` comum, com dois pontos de entrada: `notifyNewLead` (etapa `intencao`) e `notifyVerifiedLead` (etapa `verificado`). Título, chamada, assunto, texto do botão e a primeira mensagem do WhatsApp mudam conforme a etapa — os dois avisos não chegam mais indistinguíveis na caixa da equipe. O retorno é ignorado de propósito: o lead já está no Redis e a resposta precisa carregar a URL de checkout.
5. ✅ **TTL do `verified-lead`** — Resolvido. De 30 min para **24 h** (`VERIFIED_TTL_SECONDS`, em `lib/otpStore.ts`). A janela antiga descartava em silêncio quem pagava fora dela — PIX gerado à noite é pago na manhã seguinte, cartão recusado tem nova tentativa horas depois. Continua valendo reavaliar quando o gateway estiver ligado e o tempo real de conversão for conhecido.
6. ✅ **Nome da loja em `/inscricao`** — Resolvido. O campo virou **obrigatório nos dois funis**: existe no formulário de `/inscricao` (com validação), é exigido pela rota de assinatura, é gravado na sala de espera do Redis (`PendingLead.loja`) e viaja até o `VerifiedLead` e até os dois avisos. A equipe recebe a mesma informação independentemente da porta de entrada.
7. ✅ **`robots.txt` e `sitemap.xml`** — Resolvido. Ambos em `public/`. O robots libera todos os bots; `/api/` e `/checkout` ficam fora do índice e do sitemap por não terem conteúdo indexável — a primeira só responde a POST, a segunda é etapa intermediária de funil.
8. ✅ **`npm run lint`** — Resolvido. `eslint.config.js` versionado. Como o `eslint-config-next` 15.5 ainda é publicado no formato eslintrc, o `FlatCompat` faz a tradução (é o que o próprio `create-next-app` gera hoje), e `@eslint/eslintrc` entrou como devDependency em vez de depender de um pacote transitivo. O lint roda com **0 erros**; restam 2 avisos pré-existentes e inofensivos (`amountCents` em `lib/checkout.ts`, usado só nas chamadas de gateway comentadas, e um `catch (e)` sem uso em `public/demo-modal.js`).
9. ✅ **CI** — Resolvido. `.github/workflows/ci.yml` roda em Pull Requests para a `main`: Node 20, `npm ci`, `npm run lint`, `tsc --noEmit` e `next build`. Até então o único portão antes de produção era a Vercel, que constrói **depois** do merge.

**Item extra, não previsto na lista:** o fallback em memória do `otpStore` vivia preso ao módulo. Como em desenvolvimento o Next compila cada rota em um bundle próprio, `signup-intent` e `verify-otp` tinham cada uma a *sua* sala de espera — o código enviado por uma nunca era encontrado pela outra, e o fluxo de OTP era impossível de testar local sem Upstash. Passou a viver no `globalThis`. Em produção o caminho nem é usado, já que lá o Redis é obrigatório.

### ✅ Resolvidos — 17 de agosto de 2026

Sprint separada da anterior, mesmo dia. Todos validados com `npm run lint`, `npx tsc --noEmit` e `npm run build`, mais Playwright contra o dev server (interação real com a Calculadora, abertura do modal pelos CTAs novos e pelos que continuam no bundle, envio completo até "Pedido recebido", telas de 390 px e 1440 px, sem erro de console).

10. ✅ **Duas fontes de verdade de UI** — Resolvido parcialmente, do jeito seguro. Cabeçalho e Hero saíram do bundle e viraram componentes React reais (`components/landing/Header.tsx`, `Hero.tsx`), com o mesmo conteúdo/estrutura extraídos byte a byte do template antigo. `Pricing.tsx` também virou componente e já está em uso de verdade em `/inscricao`. *(18/08: `/inscricao` deixou de existir e o componente saiu junto — ver [Resolvidos](#-resolvidos--18-de-agosto-de-2026).)* O resto (Calculadora, Estoque, CRM, Portais, Planos *na própria landing*, Legal, Footer) **continua** no bundle — e não por preguiça: o motor do bundle (`dc-runtime`, decodificado e lido linha a linha para esta migração) monta React sobre um único nó `<x-dc>` e RE-RENDERIZA A SUBÁRVORE INTEIRA a cada `setState` da Calculadora. `<x-dc>` só existe em um lugar do documento; fatiar mais alguma seção pra fora dele sem entender essa restrição quebraria a Calculadora na primeira interação. O comentário grande no topo de `public/legacy-mount.js` documenta isso para quem for continuar a migração.
11. ✅ **LCP depende de JavaScript** — Resolvido para a dobra acima. `app/page.tsx` deixou de ser um redirect para HTML estático: agora é uma página real do App Router, prerenderizada (○ no output do build). O HTML que chega no primeiro byte já contém a headline, o subtítulo e o CTA do Hero — confirmado via `curl`, sem depender de nenhum JavaScript rodar. O restante da página segue montando em runtime como antes.
12. ✅ **Fontes em base64** — Resolvido. As 11 fontes (`Geist`/`Geist Mono`, 5 e 6 subsets) saíram do manifest embutido em base64 e viraram arquivos `.woff2` reais em `public/fonts/`, referenciados por `@font-face` em `app/globals.css` — cacheáveis separadamente do HTML, com preload dos subsets latin no `<head>`. O bundle legado (`public/legacy-content.html`) caiu de ~497 KB para ~252 KB só com essa remoção; o restante de peso das fontes (mais os 4 ícones do Header/Hero, extraídos como SVG reais em `public/icons/`) virou download único, cacheado à parte.
13. **`.bak`** — sem mudança de status: seguiu confirmado, de novo, que o arquivo nunca esteve no Git. Nada a resolver por aqui.

**Achado técnico registrado para quem mexer nisso de novo:** `<div dangerouslySetInnerHTML={{ __html: "" }} suppressHydrationWarning />` é obrigatório no container onde um script externo (`legacy-mount.js`) injeta DOM por fora do React — sem isso, o primeiro reconcile do React encontra filhos que não gerou e os apaga, entendendo como mismatch de hidratação. Documentado com o mesmo nível de detalhe em `app/page.tsx`.

### ✅ Resolvidos — 18 de agosto de 2026

Sprint de conversão (branch `claude/subscription-funnel-refactor-rpiawy`). Não fecha nenhum item numerado da seção 6: é mudança de estratégia de funil, decidida depois que os dois caminhos já estavam funcionando. Validada com `npm run lint` (0 erros), `npx tsc --noEmit`, `npm run build` e Playwright contra o dev server — modal aberto pelos dois botões de plano em 1280×900 e em 390×844 (iPhone 13), envio completo até "Pedido recebido", payload conferido (`plan`, `origem`), troca de funil sem recarregar a página, regressão do modal de demonstração e ausência de erros de console.

- ✅ **Um modal só, na própria landing.** Os botões de plano abriam `/inscricao?plano=…`, uma página isolada. Agora abrem o mesmo modal dos CTAs de demonstração (`public/lead-modal.js`, renomeado de `demo-modal.js`), com os mesmos 4 campos (Nome, E-mail, WhatsApp, Nome da loja) e o mesmo padrão visual e de acessibilidade — Escape, backdrop, trap de Tab, devolução de foco. **O plano vem do botão clicado** (`data-ag-signup="BASICO|PRO"`), não de uma escolha repetida dentro do modal: quem clicou em "Começar agora" no card do Pro já escolheu. Todo o texto que depende do funil (eyebrow com plano e preço, título, subtítulo, rótulo do botão, aviso legal e a mensagem de sucesso) é reescrito a cada abertura, então abrir pelo Pro, fechar e reabrir pelo Básico mostra o conteúdo certo.
- ✅ **Fim do código por e-mail (Muro 2).** `app/api/verify-otp` e a "sala de espera" de 15 min foram removidos, junto com `generateOtp`, `PendingLead`, o limitador próprio de tentativas e o e-mail de OTP em `lib/resend.ts`. O Turnstile continua sendo o que barra robô; o código provava posse do e-mail, garantia que ninguém consumia — quem fecha a venda é um consultor pelo WhatsApp. `lib/otpStore.ts` virou `lib/leadStore.ts` e guarda só o que o Muro 1 vai precisar: `signup-lead:{email}` com TTL de **7 dias** (não mais 24 h — a cobrança agora nasce depois do contato humano, que leva mais de um dia). O webhook de pagamento acompanhou o nome (`getSignupLead`, `SignupLead`).
- ✅ **O aviso para a equipe virou o entregável dos dois funis.** Sem etapa nenhuma depois do envio, um Resend que falha significa que ninguém soube do pedido — então a rota devolve 502 nos dois fluxos, em vez de só no de demonstração. Já a gravação no Redis **não** derruba a resposta: perder um lead quente porque o Upstash piscou seria trocar conversão por infraestrutura. O e-mail perdeu a distinção de etapa (`intencao`/`verificado`, que não existe mais) e passou a distinguir só a origem: "Pedido de demonstração" ou "Lead novo: quer assinar", com a primeira mensagem do WhatsApp já escrita para cada caso.
- ✅ **Copy da seção de Planos.** "Preço fechado por loja" → **"Preço fixo por loja"** ("fechado" podia ser lido como *pacote fechado*, o oposto do que a frase quer dizer). A lista do Pro passou a ancorar no Básico em vez de repetir o que ele já entrega: abre com **"Tudo do plano Básico, mais:"** em destaque e detalha os 5 diferenciais — acessos com controle de permissões, CRM em Kanban, repasse automático para múltiplos portais, mesa de crédito multibancos e suporte prioritário humano.
- ✅ **Limpeza do que ficou órfão.** Saíram `app/inscricao`, `app/cadastro` (que só redirecionava para ela), `components/SignupForm.tsx`, `components/TurnstileWidget.tsx`, `components/landing/Pricing.tsx`, `lib/phoneMask.ts` e as regras de CSS que só existiam para eles. `/inscricao` e `/cadastro` viraram **redirects 308 para `/#planos`** (`next.config.js`): os caminhos ainda vivem em anúncios e no histórico de quem já visitou, e devolver 404 ali perderia justamente o lead que já vinha assinar. `sitemap.xml` perdeu a entrada de `/inscricao`.

**Sobre o `Pricing.tsx` removido:** ele era a versão React dos cards de plano, extraída do bundle na sprint anterior (item 10), e o único lugar que a usava de verdade era `/inscricao`. Com a página fora, ele viraria uma segunda cópia da lista de benefícios, sem ninguém renderizando — exatamente o problema que o item 10 aponta. A seção de Planos que o visitante vê continua vindo do bundle, e agora é a única fonte dessa copy. Quando a migração do bundle avançar, o componente volta do histórico (`git show ea1b3b2:components/landing/Pricing.tsx`).

---

## 7. Operação

### Variáveis de ambiente (Vercel, Production)

| Variável | Papel | Se faltar |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limit + registro do lead para o Muro 1 | **500** — lança primeiro |
| `TURNSTILE_SECRET_KEY` | verificação anti-bot no servidor | **500** em produção |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | widget na landing (via `/api/turnstile-config`) | widget não renderiza → **400** por falta de token |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | aviso de lead novo (único entregável do funil) | **500**; sem o aviso, erro para o visitante nos dois fluxos |
| `LEAD_NOTIFICATION_EMAIL` | caixa que recebe o aviso | usa `yagocandeia93@gmail.com` |
| `PAYMENT_GATEWAY` + chaves | Muro 1 | `/checkout` mostra a tela, mas nenhuma cobrança acontece |

Todas documentadas em `.env.example`.

### Configuração do projeto na Vercel

Framework Preset **Next.js**, Output Directory e Root Directory **vazios**. `vercel.json` declara o framework e tem precedência sobre o painel — mas **não** cobre o caso de Root Directory apontar para `public/`, em que a Vercel nem lê o arquivo.

### Diagnóstico rápido

```bash
# 405 = app Next rodando | 404 = voltou a servir estático
curl -i https://autogirodms.com.br/api/signup-intent

# deve devolver a site key, não null
curl -s https://autogirodms.com.br/api/turnstile-config
```

**Rate limit: 3 tentativas / 10 min / IP.** Ao testar o formulário várias vezes seguidas, o **429** é o muro funcionando — não é bug.

---

## 8. Reconhecimento do que já era bom

A arquitetura de segurança do funil é mais madura que a camada de apresentação era. Os "3 Muros" — rate limit com Upstash, Turnstile verificado no servidor, OTP com `randomInt` do `node:crypto` e limite próprio de tentativas, e verificação de assinatura de webhook com idempotência via `Redis SET NX` — estavam acima do que a maioria das landings de SaaS early-stage implementa. *(O Muro 2, o OTP, foi retirado em 18/08 — não por ser frágil, mas por cobrar do visitante uma garantia que o negócio não usava; ver [Resolvidos](#-resolvidos--18-de-agosto-de-2026).)* O gargalo nunca foi robustez de backend: era ligação entre as partes e ausência de conteúdo comercial.

No design, também já estavam corretos: breakpoints cobrindo 1150/1100/1024/900/620 px, tratamento de `prefers-reduced-motion`, `font-display: swap` em todas as `@font-face`, um único `<h1>`, semântica de `<nav>`/`<footer>`/`<article>` e ícones decorativos fora da árvore de acessibilidade.
