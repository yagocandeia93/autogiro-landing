/*
 * Ícones da página de checkout, desenhados inline em SVG traçado (grade de
 * 16/18/20px, traço 1.6) em vez de virem de public/icons: são pequenos, usados
 * em quantidade (um por item de lista) e precisam herdar `currentColor` para
 * mudar de cor entre o verde de confirmação, o âmbar e o cinza de apoio — o
 * que um <img> não faz. Os SVGs de public/icons continuam sendo os certos para
 * marca e selos, que aparecem uma vez só e têm cor própria.
 */

interface IconProps {
  size?: number;
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconCheck({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconLock({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconShield({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3 5 6v5.5c0 4.3 2.9 8.2 7 9.5 4.1-1.3 7-5.2 7-9.5V6l-7-3Z" />
    </svg>
  );
}

export function IconGift({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M3 13h18M12 9v12" />
      <path d="M12 9S10.8 5 8.5 5a2.5 2.5 0 0 0 0 5H12Zm0 0s1.2-4 3.5-4a2.5 2.5 0 0 1 0 5H12Z" />
    </svg>
  );
}

export function IconClock({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 1.9" />
    </svg>
  );
}

export function IconArrowLeft({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
    </svg>
  );
}

export function IconWhatsApp({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.4-.5.2-.4v-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3c-.3.3-.9.9-.9 2.1s.9 2.5 1.1 2.6a9.4 9.4 0 0 0 3.6 3.2c1.7.7 2.1.6 2.5.5.6 0 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1Z" />
    </svg>
  );
}

/**
 * Aproximação do losango do Pix (o mark oficial é um arquivo da marca, que não
 * está neste repositório). Serve para identificar a aba de um mockup, não para
 * reproduzir a marca registrada — quando o gateway entrar e o Pix for real,
 * troque por `public/icons/pix.svg` da identidade do Banco Central.
 */
export function IconPix({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 2.9 21.1 12 12 21.1 2.9 12z" />
      <path d="M8.5 8.5 12 12l3.5-3.5M8.5 15.5 12 12l3.5 3.5" />
    </svg>
  );
}

export function IconCreditCard({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6 15h3" />
    </svg>
  );
}
