/** @type {import('next').NextConfig} */
const nextConfig = {
  // "/" é uma página real do App Router (app/page.tsx): Cabeçalho e Hero
  // renderizam como React SSR'd; o restante (Calculadora, Estoque, CRM,
  // Portais, Planos, Legal, Footer) ainda vem do bundle exportado do Claude
  // Design, buscado em runtime a partir de public/legacy-content.html — ver
  // o comentário grande em public/legacy-mount.js para o porquê.
  reactStrictMode: true,

  // /inscricao era a página isolada do funil de assinatura (formulário +
  // código por e-mail). O funil virou um modal na própria landing
  // (public/lead-modal.js), e a página foi removida — mas o caminho ainda
  // existe em links de anúncio, em conversas de WhatsApp e no histórico de
  // quem já visitou. Devolver 404 para essa gente seria perder exatamente o
  // lead que já estava vindo assinar; o redirect os entrega na seção de
  // Planos, onde os botões abrem o modal. /cadastro é a versão ainda mais
  // antiga do mesmo caminho, que já vivia como redirect para /inscricao.
  async redirects() {
    return [
      { source: "/inscricao", destination: "/#planos", permanent: true },
      { source: "/cadastro", destination: "/#planos", permanent: true },

      // /login e /entrar não existem como página aqui de propósito: um
      // formulário de login na Vercel seria uma fachada — a autenticação de
      // verdade mora no app do Railway. Quem digita esses caminhos por
      // instinto é cliente, então mandamos direto para lá.
      //
      // 307 (permanent: false) e não 301: o 301 fica gravado no navegador do
      // usuário para sempre, e o caminho de login do app é decisão do outro
      // repositório. Se ele mudar, o 307 nos deixa corrigir; o 301 não.
      //
      // URL repetida de lib/app.ts — este arquivo é CommonJS e roda antes do
      // TypeScript, então não dá para importar de lá.
      { source: "/login", destination: "https://app.autogirodms.com.br/login", permanent: false },
      { source: "/entrar", destination: "https://app.autogirodms.com.br/login", permanent: false },
    ];
  },
};

module.exports = nextConfig;
