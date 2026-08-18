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
    ];
  },
};

module.exports = nextConfig;
