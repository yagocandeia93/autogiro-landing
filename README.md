# autogiro-landing

Landing comercial do AutoGiro DMS (`autogirodms.com.br`, Vercel). Separado do
app principal (`app.autogirodms.com.br`, roda no Railway) de propósito —
mantém o app de produção intocado enquanto essa área de vendas evolui.

## O que existe hoje

- **A landing, dividida em duas partes** (migração de 17/08 — docs/STATUS.md,
  itens 10 e 11):
  - `app/page.tsx` + `components/landing/{Header,Hero,Legal,Footer,TrustBadges}.tsx`
    — Cabeçalho e Hero (a dobra acima) são componentes React reais, SSR'd
    pelo Next. O HTML que chega no primeiro byte já tem a headline, o
    subtítulo e o CTA — sem esperar JavaScript rodar.
  - `public/legacy-content.html` + `public/legacy-mount.js` — o restante
    (Calculadora, Estoque, CRM, Portais, Planos na própria landing, Legal,
    Footer) continua vindo do bundle estático exportado pelo Claude Design
    (fontes e imagens embutidas em base64, exceto as fontes — ver item 12).
    `legacy-mount.js` busca esse arquivo em runtime e monta o conteúdo dentro
    de `#ag-legacy-root`, logo depois do Hero. A Calculadora tem estado
    reativo (React montado sobre um único nó `<x-dc>` que re-renderiza a
    própria subárvore inteira a cada slider) — por isso ela, Planos e o
    resto não puderam seguir o mesmo caminho do Cabeçalho/Hero sem arriscar
    quebrar essa reatividade. Antes de tentar migrar mais alguma seção,
    leia o comentário grande no topo de `legacy-mount.js`.
  - Todos os CTAs de conversão abrem o **mesmo modal**
    (`public/lead-modal.js`), e o contrato é um atributo só, igual nas duas
    partes: `data-ag-signup="BASICO|PRO"` nos botões da seção de Planos
    ("Testar 7 dias grátis" / "Começar 7 dias grátis") e `data-ag-demo` nos CTAs de
    "Agendar demonstração". O clique é capturado por delegação no
    `document`, porque o runtime do bundle re-renderiza a própria subárvore
    a cada `setState` da Calculadora e mataria um listener preso no botão.
- `app/api/signup-intent` — **Muro 3 (Defesa Anti-Abuso)**, e hoje a única
  rota do funil: rate limit (3 tentativas / 10 min / IP, via Upstash Redis) +
  verificação server-side do Cloudflare Turnstile + validação de
  nome/e-mail/WhatsApp/loja (e do plano, no funil de assinatura). Atende os
  dois funis do modal (`origem=plano` e `origem=demonstracao`), avisa a
  equipe pelo Resend e, no funil de assinatura, guarda o lead no Redis para o
  Muro 1. Não cria loja nem cobra ninguém ainda.
- `public/lead-modal.js` — **o funil inteiro, em um modal na própria
  landing**. Captura Nome, E-mail, WhatsApp (com máscara `(99) 99999-9999`) e
  Nome da loja; o plano vem do botão clicado, não de uma escolha repetida
  dentro do modal. Valida os campos no navegador antes de sequer olhar pro
  Turnstile; o widget carrega em paralelo desde a abertura, e se o token
  ainda não chegou quando a pessoa envia, o modal espera em vez de falhar.
  Trata 429 (limite de tentativas), falha do Turnstile e queda de conexão com
  mensagens próprias. É um arquivo estático, servido fora do build do Next —
  daí `/api/turnstile-config`, que entrega a site key em runtime.
- **Depois do 200 OK, os dois funis se separam**: quem pediu demonstração vê a
  confirmação e a janela fecha sozinha (não há para onde ir — o consultor é
  que liga); quem escolheu um plano é REDIRECIONADO para
  `/checkout?plano=BASICO|PRO`, levando a intenção até a tela de pagamento em
  vez de terminar a jornada dentro do modal. O redirect usa
  `window.location.assign` porque este arquivo vive fora da árvore de módulos
  do Next (não há router para importar), tem timer próprio — fechar a janela
  não cancela a navegação de quem já enviou os dados — e o painel de sucesso
  ainda mostra um link explícito para o checkout, caso o redirect automático
  seja bloqueado.
- **Por que modal, e por que em arquivo separado**: a página isolada
  (`/inscricao`) tirava o visitante da landing no momento de maior intenção;
  o modal mantém a decisão na mesma tela, com o mesmo padrão visual do modal
  de demonstração que já existia. Ele não pôde virar componente React porque
  o miolo da landing ainda é o bundle exportado do Claude Design, renderizado
  por um motor de template próprio (diretivas `sc-if`, `sc-raw-select` etc.)
  incompatível com React — e o modal precisa viver **fora** de `<x-dc>`, ou
  um re-render da Calculadora o apagaria no meio do preenchimento.
- **Sem código por e-mail (o antigo Muro 2)**: existiam `/api/verify-otp`,
  uma "sala de espera" de 15 min no Redis e um código de 6 dígitos entre o
  formulário e o fim do funil. Isso saiu inteiro. O Turnstile é o que barra
  robô; o código provava posse do e-mail, garantia que ninguém consumia,
  porque quem fecha a venda é um consultor pelo WhatsApp — e cada passo a
  mais (sair da landing, esperar o e-mail, achar o código, voltar, digitar)
  custava lead. Hoje o envio termina em um passo só, e o aviso para a equipe
  é o entregável: se o Resend falhar, a rota devolve erro, porque sem aviso
  o pedido não existe para ninguém. `/inscricao` e `/cadastro` viraram
  redirects 308 para `/#planos` (`next.config.js`) — os caminhos ainda vivem
  em anúncios e no histórico de quem já visitou, e um 404 ali perderia
  justamente o lead que já vinha assinar.
- **O que fica guardado** (`lib/leadStore.ts`): nada disso cria linha no
  banco do AutoGiro. O funil de assinatura grava
  `{ nome, email, whatsapp, loja, plan }` como `signup-lead:{email}` no Redis
  (TTL 7 dias) — é o registro que o webhook do gateway vai procurar quando a
  cobrança for paga. Falha de Redis ali **não** derruba a resposta: perder um
  lead quente porque o Upstash piscou seria trocar conversão por
  infraestrutura. O funil de demonstração não grava nada; o e-mail para a
  equipe é o único registro dele.

- **Muro 1 (Pagamento) — estrutura pronta, gateway ainda não escolhido:**
  - `lib/checkout.ts` — `createCheckoutLink(lead)`: hoje devolve o link local
    (`/checkout`), o mesmo destino do redirect do modal. O corpo tem os dois
    TODOs comentados (chamada real ao Asaas e ao Pagar.me) prontos pra
    descomentar assim que a chave existir — a assinatura da função não muda.
  - `app/checkout` — a **interface** do checkout, construída antes do gateway:
    resumo do pedido (plano, preço, "7 dias grátis, cancele quando quiser") e
    duas abas de forma de pagamento. **Cartão** (padrão) tem validação real
    (Luhn, validade, CVV por bandeira); **Pix** é um estado ilustrativo — QR
    desfocado e "o QR Code será gerado na próxima etapa" —, porque o payload do
    Pix é assinado pelo gateway, não por nós, e um código nítido só convidaria
    alguém a tentar pagar. Os dois painéis ficam montados ao mesmo tempo, então
    quem espia o Pix no meio do preenchimento não perde o cartão já digitado.
    **Não cobra ninguém**: os dois caminhos abrem o mesmo aviso, dizendo que a
    cobrança está sendo configurada e que o consultor conclui pelo WhatsApp.
    Quando a chave existir, o que muda é o `onSubmit`/`simularEnvio` do
    formulário.
  - `lib/plans.ts` — nome, preço e itens dos dois planos em um lugar só, que é
    o que `lib/checkout.ts` e a página de checkout leem. Os textos em
    `public/` (bundle e modal) seguem com a cópia própria: são estáticos,
    fora da árvore de módulos do Next.
  - `app/api/webhooks/payment` — o ouvinte do gateway. **Verifica a
    assinatura antes de confiar em qualquer coisa do corpo**: Asaas manda um
    token estático (`asaas-access-token`, comparação timing-safe) e
    Pagar.me manda HMAC-SHA256 de verdade (`x-hub-signature`) — são
    mecanismos diferentes, `lib/webhookSignature.ts` implementa os dois e
    escolhe pela env `PAYMENT_GATEWAY`. Sem o segredo configurado, a rota
    recusa tudo (falha fechada, não aberta).
  - **Idempotência**: gateways reenviam o mesmo evento em retry.
    `claimWebhookEvent` (Redis `SET NX`, `lib/leadStore.ts`) garante que um
    evento só processa uma vez — sem isso, um retry duplicaria o
    provisionamento e o e-mail de "acesso liberado".
  - **O gatilho final é mock, de propósito**: `triggerProvisioning()`
    dentro do webhook só imprime um log. O corpo real (chamar um endpoint
    interno no app do Railway pra criar o tenant, depois mandar o e-mail de
    acesso) está comentado, porque criar tenant é mudança de RBAC no repo
    do AutoGiro e precisa do próprio `/plan` aprovado **lá** antes de sair
    do papel — ver o próximo item.
- **A ponte para o app principal (ainda não existe, decisão pendente no
  outro repo)**: depois que o webhook confirmar o pagamento, algo precisa
  criar a loja de verdade (organização + admin + `CompanySettings`) no
  banco do AutoGiro, que roda no Railway, não aqui. Hoje isso é
  `npm run onboard:loja`, rodado à mão. Virar isso num endpoint interno
  chamado por este webhook é decisão de RBAC — o `src/lib/prisma.ts` do
  app principal foi desenhado de propósito para NENHUM papel enxergar entre
  lojas. Precisa de `/plan` próprio no repo do AutoGiro antes de
  implementar essa chamada de verdade.
- **TTL do `signup-lead` (7 dias) vs. tempo real de pagamento**: eram 30 min,
  depois 24 h, sempre medidos a partir de um checkout que abria na mesma
  sessão. Com o fim do código por e-mail, o funil termina com um consultor
  entrando em contato em até 1 dia útil e a cobrança nasce **depois** dessa
  conversa — uma janela de 24 h expiraria o registro antes do primeiro
  contato, e o webhook chegaria sem achar quem provisionar. Reavaliar quando
  o gateway estiver ligado e o tempo real entre contato e pagamento for
  conhecido.

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencha as chaves do Turnstile, Upstash e Resend
npm run dev
```

Sem `UPSTASH_REDIS_REST_URL`/`TOKEN`: cai num rate limiter (e num
armazenamento de leads) em memória — só para dev, avisa no console, e **é
perdido a cada restart do servidor**. Sem `TURNSTILE_SECRET_KEY`: aceita
qualquer token em dev. Sem `RESEND_API_KEY`: não envia e-mail, só imprime o
aviso de lead no terminal — dá para testar o modal inteiro sem conta no
Resend.
**Em produção (`NODE_ENV=production`), as três faltando derrubam a rota com
erro — de propósito, para não subir sem proteção real.**

## Variáveis de ambiente (produção, painel da Vercel)

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` — Cloudflare
  Turnstile (dashboard Cloudflare → Turnstile → criar site).
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis
  (console.upstash.com → criar banco → REST API).
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — Resend (resend.com → API Keys).
  **O remetente precisa ser de um domínio verificado no Resend** — não dá
  pra mandar de um Gmail. Se `autogirodms.com.br` ainda não está verificado
  lá, esse é o primeiro passo antes de testar em produção.
- `PAYMENT_GATEWAY` (`asaas` ou `pagarme`) + a chave e o webhook secret do
  gateway escolhido (`ASAAS_API_KEY`/`ASAAS_WEBHOOK_SECRET` ou
  `PAGARME_API_KEY`/`PAGARME_WEBHOOK_SECRET`) — decisão de sexta.
- `AUTOGIRO_APP_URL` / `PROVISIONING_SHARED_SECRET` — só entram em uso
  quando o endpoint interno de provisionamento existir no repo do AutoGiro
  (não existe ainda, ver seção acima).

## Arquivo solto

`AutoGiro-DMS-Landing-Page.html.bak` na raiz é uma cópia de trabalho do
upload original — já está no `.gitignore`, pode apagar manualmente quando
quiser (o sandbox que estruturou este repo não teve permissão de apagar
esse arquivo específico).
