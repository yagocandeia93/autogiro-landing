# autogiro-landing

Landing comercial do AutoGiro DMS (`autogirodms.com.br`, Vercel). Separado do
app principal (`app.autogirodms.com.br`, roda no Railway) de propósito —
mantém o app de produção intocado enquanto essa área de vendas evolui.

## O que existe hoje

- **A landing, dividida em duas partes** (migração de 17/08 — docs/STATUS.md,
  itens 10 e 11):
  - `app/page.tsx` + `components/landing/{Header,Hero,Pricing}.tsx` —
    Cabeçalho e Hero (a dobra acima) são componentes React reais, SSR'd pelo
    Next. O HTML que chega no primeiro byte já tem a headline, o subtítulo e
    o CTA — sem esperar JavaScript rodar. `Pricing` também virou componente
    de verdade e é reaproveitado em `/inscricao`.
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
  - Os botões da seção de Planos (`href="/inscricao?plano=…"`) e os CTAs
    "Agendar demonstração" (`data-ag-demo`, abrindo o modal de
    `public/demo-modal.js`) existem nas duas partes — o contrato é o mesmo
    atributo/href dos dois lados, não uma lógica duplicada.
- `app/api/signup-intent` — **Muro 3 (Defesa Anti-Abuso)**: rate limit (3
  tentativas / 10 min / IP, via Upstash Redis) + verificação server-side do
  Cloudflare Turnstile + validação de nome/e-mail/WhatsApp. Não cria loja nem
  cobra ninguém ainda — só prova que as barreiras funcionam de ponta a ponta.
- `app/inscricao` — formulário real de captura (Nome, E-mail, WhatsApp com
  máscara `(99) 99999-9999`), pra onde os botões dos planos levam. Valida os
  3 campos no navegador antes de sequer olhar pro Turnstile; o widget roda
  em paralelo enquanto a pessoa digita, então na prática o token já está
  pronto quando ela termina. Mostra "Aguarde..." no botão durante o envio, e
  mensagens amigáveis específicas para limite de tentativas (429) e falha do
  Turnstile. Componente principal: `components/SignupForm.tsx`.
- **Por que página nova em vez de modal dentro do próprio HTML**: o
  `public/index.html` não é uma página comum — é renderizado por um motor de
  template próprio embutido no bundle (diretivas `sc-if`, `sc-raw-select`
  etc.), incompatível com componentes React. Construir o formulário como
  página Next.js de verdade (`/inscricao`) foi a forma segura de fazer os
  3 campos + máscara + Turnstile + tratamento de erro funcionarem de verdade,
  sem arriscar quebrar o motor de template do design original.

- `app/api/verify-otp` — **Muro 2 (Validação de E-mail)**: recebe e-mail +
  código de 6 dígitos, confere contra a "sala de espera" no Redis
  (`lib/otpStore.ts`), com rate limit próprio (5 tentativas / 15 min, por
  e-mail E por IP — um código de 6 dígitos só tem 1 milhão de combinações,
  então essa rota precisa do próprio limite, não só o do Turnstile). Acerta →
  o lead vira `verified-lead:{email}` no Redis (TTL 24 h), pronto pro Muro
  1, e a equipe recebe o segundo aviso por e-mail ("e-mail confirmado", o
  lead mais quente do funil). Erra → conta a tentativa contra o lead; 5
  erradas apaga o código e pede pra recomeçar.
- **Estratégia "sala de espera"** (`lib/otpStore.ts`): nada disso cria linha
  no banco do AutoGiro. `signup-intent` gera o OTP (`node:crypto.randomInt`,
  não `Math.random` — é um código de segurança) e guarda
  `{ nome, email, whatsapp, loja, plano, otp, attempts }` no Redis por 15 min, e
  dispara o e-mail via Resend (`lib/resend.ts`). Sem `RESEND_API_KEY` em dev,
  o código é só impresso no console — não precisa de conta no Resend pra
  testar o fluxo localmente.
- `app/inscricao` agora tem duas etapas: o formulário (Nome/E-mail/WhatsApp +
  Turnstile) e, depois do envio, a tela de código OTP. Errar o e-mail digitado
  tem um link pra voltar; código expirado ou tentativas esgotadas mandam de
  volta pro formulário automaticamente.

- **Muro 1 (Pagamento) — estrutura pronta, gateway ainda não escolhido:**
  - `lib/checkout.ts` — `createCheckoutLink(lead)`: hoje devolve um link
    local (`/checkout`, placeholder). O corpo tem os dois TODOs comentados
    (chamada real ao Asaas e ao Pagar.me) prontos pra descomentar assim que
    a chave existir — a assinatura da função não muda.
  - `app/api/webhooks/payment` — o ouvinte do gateway. **Verifica a
    assinatura antes de confiar em qualquer coisa do corpo**: Asaas manda um
    token estático (`asaas-access-token`, comparação timing-safe) e
    Pagar.me manda HMAC-SHA256 de verdade (`x-hub-signature`) — são
    mecanismos diferentes, `lib/webhookSignature.ts` implementa os dois e
    escolhe pela env `PAYMENT_GATEWAY`. Sem o segredo configurado, a rota
    recusa tudo (falha fechada, não aberta).
  - **Idempotência**: gateways reenviam o mesmo evento em retry.
    `claimWebhookEvent` (Redis `SET NX`, `lib/otpStore.ts`) garante que um
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
- **TTL do `verified-lead` (24 h) vs. tempo real de pagamento**: eram 30 min,
  curtos demais — PIX gerado à noite é pago na manhã seguinte e cartão
  recusado costuma ter retry manual horas depois, então o webhook chegava
  sem achar o lead e alguém que **já tinha pago** era descartado em
  silêncio. Com 24 h a janela cobre o comportamento real; se o pagamento
  confirmar mesmo assim depois disso, o webhook (corretamente) não acha o
  lead e loga erro. Reavaliar de novo quando o gateway estiver ligado e o
  tempo real de conversão for conhecido.

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencha as chaves do Turnstile, Upstash e Resend
npm run dev
```

Sem `UPSTASH_REDIS_REST_URL`/`TOKEN`: cai num rate limiter (e numa sala de
espera) em memória — só para dev, avisa no console, e **é perdido a cada
restart do servidor**. Sem `TURNSTILE_SECRET_KEY`: aceita qualquer token em
dev. Sem `RESEND_API_KEY`: não envia e-mail, só imprime o OTP no terminal.
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
