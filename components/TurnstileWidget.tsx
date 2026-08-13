"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

/**
 * Widget invisível/gerenciado do Cloudflare Turnstile. Carrega o script uma
 * vez, renderiza no container e devolve o token via onVerify — esse token é
 * o que a rota /api/signup-intent valida no servidor. O widget sozinho não
 * prova nada; é a validação do lado do servidor que conta.
 */
export function TurnstileWidget({
  onVerify,
  onExpire,
}: {
  onVerify: (token: string) => void;
  onExpire?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) {
      console.warn(
        "[Turnstile] NEXT_PUBLIC_TURNSTILE_SITE_KEY não configurada."
      );
      return;
    }

    function render() {
      if (!containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey!,
        callback: onVerify,
        "expired-callback": onExpire,
      });
    }

    if (window.turnstile) {
      render();
      return;
    }

    const existing = document.querySelector(
      `script[src="${SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", render);
      return () => existing.removeEventListener("load", render);
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", render);
    document.body.appendChild(script);

    return () => {
      script.removeEventListener("load", render);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} />;
}
