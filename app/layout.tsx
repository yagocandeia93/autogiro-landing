import type { Metadata } from "next";
import "./globals.css";

const TITLE = "AutoGiro DMS | Sistema de Gestão para Revenda de Veículos";
const DESCRIPTION =
  "Sistema de gestão para revendas de seminovos: custo real e margem por " +
  "veículo, CRM de leads e publicação nos portais em um único sistema.";
const ORIGIN = "https://autogirodms.com.br";

// Desde a migração de Cabeçalho/Hero para React real (docs/STATUS.md, item
// 11), este metadata alcança "/" de verdade — antes só valia para /inscricao
// e /checkout, porque a landing era um redirect para public/index.html
// (estático, com as mesmas tags duplicadas no próprio <head> do bundle).
export const metadata: Metadata = {
  metadataBase: new URL(ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "AutoGiro DMS",
    locale: "pt_BR",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AutoGiro DMS — gire o estoque mais rápido e saiba o lucro real de cada carro.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: o conteúdo legado (public/legacy-mount.js)
    // adiciona a classe "ag-js" a este <html> assim que monta — é o mesmo
    // padrão de um script de dark-mode que toca documentElement antes da
    // hidratação terminar; sem isto, React loga (mas não corrige — o aviso
    // já diz "this won't be patched up") um mismatch inofensivo no className.
    <html lang="pt-BR" suppressHydrationWarning>
      {/*
        Preload só dos subsets latin (o único que a maioria dos visitantes
        brasileiros carrega) das duas famílias — Next hoisting coloca isto no
        <head> de qualquer página. Reduz o tempo até o texto do Hero pintar
        com a fonte final em vez de um fallback (docs/STATUS.md, item 11).
      */}
      <link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="preload" href="/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <body>{children}</body>
    </html>
  );
}
