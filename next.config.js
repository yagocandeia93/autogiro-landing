/** @type {import('next').NextConfig} */
const nextConfig = {
  // A landing (public/index.html) é o design vindo do Claude Design, servida
  // estática e intocada. O Next entra só para hospedar as rotas de API
  // (Muro 3: Turnstile + rate limit) ao lado dela.
  reactStrictMode: true,
};

module.exports = nextConfig;
