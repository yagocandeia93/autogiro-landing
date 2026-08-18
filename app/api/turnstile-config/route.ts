import { NextResponse } from "next/server";

// O modal de captura de lead (public/lead-modal.js) é JavaScript servido
// estático, sem passar pelo build do Next — então ele não tem como receber
// NEXT_PUBLIC_TURNSTILE_SITE_KEY inlinada como um componente React recebe.
// Este endpoint entrega a chave em runtime, para os dois funis do modal
// (assinatura e demonstração).
//
// Expor isso é seguro: a site key é pública por definição (aparece no HTML de
// qualquer página que use Turnstile). O que protege o funil é a
// TURNSTILE_SECRET_KEY, que fica só no servidor e é usada em lib/turnstile.ts.

export const dynamic = "force-dynamic";

export function GET() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;

  return NextResponse.json(
    { siteKey },
    {
      // Sem cache: a chave pode ser trocada por variável de ambiente sem
      // rebuild, e um CDN guardando um valor velho quebraria o formulário.
      headers: { "Cache-Control": "no-store" },
    }
  );
}
