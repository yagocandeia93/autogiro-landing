/** @type {import('next').NextConfig} */
const nextConfig = {
  // "/" é uma página real do App Router (app/page.tsx): Cabeçalho e Hero
  // renderizam como React SSR'd; o restante (Calculadora, Estoque, CRM,
  // Portais, Planos, Legal, Footer) ainda vem do bundle exportado do Claude
  // Design, buscado em runtime a partir de public/legacy-content.html — ver
  // o comentário grande em public/legacy-mount.js para o porquê.
  reactStrictMode: true,
};

module.exports = nextConfig;
