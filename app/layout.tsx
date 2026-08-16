import type { Metadata } from "next";

const TITLE = "AutoGiro DMS | Sistema de Gestão para Revenda de Veículos";
const DESCRIPTION =
  "Sistema de gestão para revendas de seminovos: custo real e margem por " +
  "veículo, CRM de leads e publicação nos portais em um único sistema.";
const ORIGIN = "https://autogirodms.com.br";

// Vale para as rotas React (/inscricao, /checkout). A landing em si é
// public/index.html, servida estática, e carrega as mesmas tags no próprio
// <head> — o bundle troca o documento inteiro em tempo de execução, então o
// metadata do Next não alcança aquela página.
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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
