const WHATSAPP_NUMBER = "5583921491832";

/**
 * Mensagem padronizada por origem do clique — mesmo texto que o bundle
 * legado gera em runtime (ver a classe `Component extends DCLogic` decodificada
 * de public/legacy-content.html), reproduzido aqui para o Header/Hero que
 * agora renderizam como React de verdade.
 */
export function waLink(texto: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(texto)}`;
}

export const WA_LINK_CONSULTOR = waLink(
  "Olá! Vim pelo site do AutoGiro DMS e quero falar com um consultor sobre a gestão da minha loja."
);

export const WA_LINK_DEMO = waLink(
  "Olá! Vim pelo site do AutoGiro DMS e quero agendar uma demonstração do sistema."
);

/** Mesma mensagem que o bundle interpolava em `{{ waLinkSuporte }}` no rodapé. */
export const WA_LINK_SUPORTE = waLink(
  "Olá! Vim pelo site do AutoGiro DMS e preciso de ajuda do suporte."
);
