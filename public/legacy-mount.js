/**
 * Monta o miolo da landing (Calculadora, Estoque, CRM, Portais, Planos)
 * dentro de #ag-legacy-root, que app/page.tsx reserva logo depois do Hero.
 *
 * Por que isto existe separado de app/page.tsx: Cabeçalho e Hero migraram
 * para componentes React reais, SSR'd (docs/STATUS.md, itens 10 e 11) — são
 * estáticos, sem state, então tirá-los do bundle exportado do Claude Design
 * era seguro. Legal e Footer seguiram pelo mesmo caminho depois, pelo mesmo
 * motivo (components/landing/Legal.tsx, Footer.tsx) — o que sobrou aqui é a
 * faixa entre o Hero e o rodapé. O MIOLO não pôde seguir junto porque a
 * calculadora de giro tem estado reativo: o runtime do bundle (minificado,
 * carregado como blob a partir do manifest) monta React sobre um único nó
 * `<x-dc>` e, a cada slider mexido, RE-RENDERIZA A SUBÁRVORE INTEIRA a partir
 * do template que capturou em `dc.innerHTML` no boot — não por diffing linha
 * a linha, mas descartando e reconstruindo tudo de uma vez. `<x-dc>` só pode
 * viver em UM lugar do documento; fatiar o meio dele (por exemplo, tirando só
 * "Planos" para ficar em outro container) quebraria essa reconstrução na
 * primeira vez que alguém arrastasse um slider. Cabeçalho e Hero puderam sair
 * porque não têm nenhum valor dependente de `state` — nunca são tocados por
 * um re-render, então remover os dois nós do template ANTES do boot é seguro:
 * o runtime nunca soube que eles existiam.
 *
 * NÃO tente separar "Planos" do restante deste bundle sem antes confirmar
 * (lendo o dc-runtime decodificado, ou perguntando) que ele sobrevive a virar
 * dois pontos de montagem — a suposição errada aqui quebra a calculadora,
 * que é o mecanismo de conversão principal da dobra acima da versão anterior
 * (ver docs/STATUS.md, seção 2.4).
 *
 * public/legacy-content.html carrega os 4 blocos `<script type="__bundler/…">`
 * (manifest, template, ext_resources, page_order) que este arquivo busca via
 * fetch() e interpreta — é o MESMO mecanismo que existia inteiro dentro de
 * public/index.html antes desta migração, só que agora lendo os dados de um
 * arquivo separado (fetch) em vez do próprio documento (querySelector), e
 * fazendo merge no <head>/<body> atuais do Next em vez de substituir
 * document.documentElement por inteiro — Next já é dono real do documento
 * agora, não só um redirect para HTML estático.
 *
 * A lógica de relay entre páginas aninhadas (frames, postMessage, gate de
 * origem) abaixo é copiada VERBATIM do bootstrap original: não depende de
 * onde manifest/template foram lidos, só do documento em que os iframes e o
 * postMessage acontecem — nenhuma mudança de comportamento ali.
 */
(async function () {
  "use strict";

  const FONT_MIME = /^(font[/]|application[/](x-)?font-|application[/]vnd\.ms-fontobject)/i;
  const MIME_TOKEN = /^[\w.+-]+[/][\w.+-]+$/;
  function toBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  // Error sink: mesmo texto/estilo do bootstrap original.
  window.addEventListener(
    "error",
    function (e) {
      if (!e.message && !e.error && e.target && e.target !== window) {
        console.warn(
          "[bundle] resource failed to load:",
          e.target.tagName,
          String(e.target.src || e.target.href || "")
        );
        return;
      }
      var p = document.body || document.documentElement;
      var d =
        document.getElementById("__bundler_err") ||
        p.appendChild(document.createElement("div"));
      d.id = "__bundler_err";
      d.style.cssText =
        "position:fixed;bottom:12px;left:12px;right:12px;font:12px/1.4 ui-monospace,monospace;background:#2a1215;color:#ff8a80;padding:10px 14px;border-radius:8px;border:1px solid #5c2b2e;z-index:99999;white-space:pre-wrap;max-height:40vh;overflow:auto";
      d.textContent =
        (d.textContent ? d.textContent + String.fromCharCode(10) : "") +
        "[bundle] " +
        (e.message || e.type) +
        (e.filename ? " (" + e.filename.slice(0, 60) + ":" + e.lineno + ")" : "");
    },
    true
  );

  try {
    const res = await fetch("/legacy-content.html");
    if (!res.ok) throw new Error("legacy-content.html: HTTP " + res.status);
    const fetchedHtml = await res.text();
    const fetchedDoc = new DOMParser().parseFromString(fetchedHtml, "text/html");

    const manifestEl = fetchedDoc.querySelector('script[type="__bundler/manifest"]');
    const templateEl = fetchedDoc.querySelector('script[type="__bundler/template"]');
    if (!manifestEl || !templateEl) {
      console.error(
        "[bundler] Missing script tags in legacy-content.html — manifestEl:",
        !!manifestEl,
        "templateEl:",
        !!templateEl
      );
      return;
    }

    const manifest = JSON.parse(manifestEl.textContent);
    let template = JSON.parse(templateEl.textContent);

    // Nested page bundles (iframe targets). Each ships ONCE, in the ROOT
    // document's manifest; frame srcs carry an about:blank#<uuid> marker
    // instead of a substitutable uuid. Every document mints the blobs for
    // its OWN frames — from local text at the root, or text obtained from
    // its DIRECT parent over the relay protocol below — so each frame
    // navigation stays same-origin with its initiator and a deduped page
    // loads at any depth on any host, including a file:// download's
    // opaque origins (where a blob minted by one document cannot be
    // navigated to by another).
    const pageOrderEl = fetchedDoc.querySelector('script[type="__bundler/page_order"]');
    const pageOrder = pageOrderEl ? JSON.parse(pageOrderEl.textContent) : [];
    const pageSet = new Set(pageOrder);
    const pageTexts = {};

    // ── Nested-page text protocol (parent-chain relay) ──
    // Page bundles ship once, in the ROOT document's manifest. Every
    // document mints the blobs for its OWN frames, obtaining page text
    // through a strict parent-chain relay: a document only ever SENDS to
    // its direct parent (which, for every document the publisher's own
    // runtime minted, is another publisher document) and only ACCEPTS
    // text from that direct parent; requests from below are honored only
    // for the document's own child frames, and the ROOT never sends
    // upward at all. That last rule is load-bearing: the artifact host's
    // frame-ancestors allows claude.ai (and friends) to frame an
    // artifact, so window.top can be a FOREIGN document — a top-addressed
    // protocol would hand page uuids to that ancestor and accept forged
    // "page text" from it, minting attacker HTML as an artifact-origin
    // blob document. The chain never touches the ancestor: requests stop
    // at the root, replies are origin-addressed per hop (never '*' when
    // an origin exists), and both directions are origin-gated (on https
    // a foreign sender's origin can never equal this document's; in
    // opaque contexts — file:// — everything serializes as 'null', where
    // an embedded EXTERNAL frame still fails the gate by carrying its
    // own real origin, and a sandboxed child of such a frame is excluded
    // by the own-child-frames check plus uuid unguessability). Shape is
    // deny-by-default: one request form, one reply form, no error
    // replies.
    // window.origin is the SERIALIZED SECURITY origin ('null' in opaque
    // contexts such as a sandboxed preview iframe) — location.origin is
    // computed from the URL and stays 'https://…' even when the document
    // is sandboxed, which would misgate every opaque chain.
    const OWN_TARGET = /^https?:[/][/]/.test(window.origin || "")
      ? window.origin
      : "*";
    function trustedOrigin(e) {
      if (e.origin === window.origin) return true; // https chains; opaque==opaque
      // file:// trees: Chrome serializes the file document's origin as
      // 'file://' while the blob: documents it mints serialize as 'null',
      // so the two legitimate shapes can never string-match — accept the
      // pair in both directions. https origins never serialize as either,
      // and sender identity (own child frame / direct parent) is checked
      // separately.
      return (
        (e.origin === "null" &&
          (window.origin === "file://" || window.location.protocol === "file:")) ||
        (/^file:/.test(e.origin) && window.origin === "null")
      );
    }
    // Non-empty only in the root document (nested bundles ship an empty
    // island), so it doubles as the root marker: the root answers from
    // local text and treats a miss as authoritative — never relaying to
    // its (possibly foreign) parent.
    const isPageRoot = pageOrder.length > 0;
    const blobUrls = {};
    const resourceBlobs = {};
    const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const pendingFrames = {}; // uuid -> [{el, frag}] awaiting text for own frames
    const pendingRelays = {}; // uuid -> [childWindow] awaiting text to pass down
    function mountPage(el, frag, text) {
      const pageBlob = new Blob([text], { type: "text/html" });
      const u = URL.createObjectURL(pageBlob);
      resourceBlobs[u] = pageBlob;
      el.src = u + frag;
    }
    function deliverPage(uuid, text) {
      const frames = pendingFrames[uuid];
      delete pendingFrames[uuid];
      if (frames) for (const f of frames) mountPage(f.el, f.frag, text);
      const relays = pendingRelays[uuid];
      delete pendingRelays[uuid];
      if (relays) {
        for (const cw of relays) {
          try {
            cw.postMessage({ __bundler_page: uuid, __bundler_text: text }, OWN_TARGET);
          } catch (err) {
            /* gone */
          }
        }
      }
    }
    function ownFrameWindows() {
      const out = [];
      for (const f of Array.from(document.querySelectorAll("iframe"))) {
        try {
          if (f.contentWindow) out.push(f.contentWindow);
        } catch (err) {
          /* detached */
        }
      }
      return out;
    }
    window.addEventListener("message", function (e) {
      const d = e.data;
      if (!d || typeof d !== "object" || !e.source) return;
      // Origin gate first; the structural checks below (own-child-frames
      // for requests, direct-parent + solicited-uuid for replies, the
      // root's never-relay rule) are what hold in fully opaque chains
      // where origin strings can't discriminate — a sandboxed root's
      // FOREIGN wrapper still fails all three even though both serialize
      // as real-vs-'null' rather than matching.
      if (!trustedOrigin(e)) return;
      if (typeof d.__bundler_need === "string" && UUID_SHAPE.test(d.__bundler_need)) {
        // Requests are honored only for this document's own child frames.
        if (ownFrameWindows().indexOf(e.source) < 0) return;
        const uuid = d.__bundler_need;
        const text = pageTexts[uuid];
        if (typeof text === "string") {
          try {
            e.source.postMessage({ __bundler_page: uuid, __bundler_text: text }, OWN_TARGET);
          } catch (err) {
            /* gone */
          }
          return;
        }
        if (isPageRoot || window.parent === window) return; // authoritative miss
        const waiting = pendingRelays[uuid];
        if (waiting) {
          if (waiting.indexOf(e.source) < 0) waiting.push(e.source);
          return;
        }
        // Never-answered uuids would otherwise accumulate forever under a
        // request spray; past the cap (far above any real page count) new
        // relays are dropped rather than remembered.
        if (Object.keys(pendingRelays).length >= 128) return;
        pendingRelays[uuid] = [e.source];
        window.parent.postMessage({ __bundler_need: uuid }, OWN_TARGET);
      } else if (
        typeof d.__bundler_page === "string" &&
        UUID_SHAPE.test(d.__bundler_page) &&
        typeof d.__bundler_text === "string"
      ) {
        // The shape test is load-bearing beyond tidiness: the solicited
        // check below uses the in operator, which matches prototype keys
        // ('__proto__', 'constructor') — an unshaped key would reach
        // deliverPage and throw, painting the error banner.
        // Text is accepted only from the direct parent — the document
        // that minted this one.
        if (e.source !== window.parent || window.parent === window) return;
        if (!(d.__bundler_page in pendingFrames) && !(d.__bundler_page in pendingRelays)) return;
        deliverPage(d.__bundler_page, d.__bundler_text);
      }
    });

    const uuids = Object.keys(manifest);

    await Promise.all(
      uuids.map(async (uuid) => {
        const entry = manifest[uuid];
        try {
          const binaryStr = atob(entry.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

          let finalBytes = bytes;
          if (entry.compressed) {
            if (typeof DecompressionStream !== "undefined") {
              const ds = new DecompressionStream("gzip");
              const writer = ds.writable.getWriter();
              const reader = ds.readable.getReader();
              writer.write(bytes);
              writer.close();
              const chunks = [];
              let totalLen = 0;
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                totalLen += value.length;
              }
              finalBytes = new Uint8Array(totalLen);
              let offset = 0;
              for (const chunk of chunks) {
                finalBytes.set(chunk, offset);
                offset += chunk.length;
              }
            } else {
              console.warn("DecompressionStream not available, asset " + uuid + " may not render");
            }
          }

          if (pageSet.has(uuid)) {
            pageTexts[uuid] = new TextDecoder().decode(finalBytes);
            return;
          }
          if (FONT_MIME.test(entry.mime) && MIME_TOKEN.test(entry.mime)) {
            // Strict artifact hosts allow font-src data: but not blob:.
            blobUrls[uuid] =
              "data:" + entry.mime + ";base64," + (entry.compressed ? toBase64(finalBytes) : entry.data);
          } else {
            const blob = new Blob([finalBytes], { type: entry.mime });
            blobUrls[uuid] = URL.createObjectURL(blob);
            resourceBlobs[blobUrls[uuid]] = blob;
          }
        } catch (err) {
          console.error("Failed to decode asset " + uuid + ":", err);
          const blob = new Blob([], { type: entry.mime });
          blobUrls[uuid] = URL.createObjectURL(blob);
          resourceBlobs[blobUrls[uuid]] = blob;
        }
      })
    );

    const extResEl = fetchedDoc.querySelector('script[type="__bundler/ext_resources"]');
    const extResources = extResEl ? JSON.parse(extResEl.textContent) : [];
    const resourceMap = {};
    for (const entry of extResources) {
      if (blobUrls[entry.uuid]) resourceMap[entry.id] = blobUrls[entry.uuid];
    }

    // Artifact-host CSP (connect-src 'self') refuses fetch() of blob: URLs —
    // consumers read these Blobs directly.
    window.__resourceBlobs = resourceBlobs;

    // Page uuids have no blob here — they ride inside about:blank#<uuid>
    // frame markers the pass below resolves after the mount.
    for (const uuid of uuids) {
      if (pageSet.has(uuid)) continue;
      template = template.split(uuid).join(blobUrls[uuid]);
    }

    // Strip integrity + crossorigin — blob URLs inherit a null origin, so
    // crossorigin forces a CORS fetch that SRI then rejects. The manifest
    // bytes are ours; SRI protects against CDN compromise, not this.
    template = template.replace(/\s+integrity="[^"]*"/gi, "").replace(/\s+crossorigin="[^"]*"/gi, "");

    const resourceScript =
      "<script>window.__resources = " + JSON.stringify(resourceMap).replace(/<\//g, "<\\/") + ";</" + "script>";
    const headOpen = template.match(/<head[^>]*>/i);
    if (headOpen) {
      const i = headOpen.index + headOpen[0].length;
      template = template.slice(0, i) + resourceScript + template.slice(i);
    }

    // Parse the trimmed template (Calculadora .. Footer — Cabeçalho e Hero já
    // não estão aqui, ver o comentário no topo deste arquivo). Next.js já é
    // dono real de <head>/<body> neste documento (Cabeçalho e Hero SSR'd), o
    // que o bootstrap original nunca precisou considerar (a landing era um
    // redirect puro para HTML estático — nada de Next rodava em "/" até
    // esta migração). Por isso o passo final aqui MERGE em vez de substituir
    // document.documentElement por inteiro: um replaceWith apagaria o SSR do
    // Cabeçalho/Hero e o runtime de hidratação do Next.
    const doc = new DOMParser().parseFromString(template, "text/html");
    // Capturado ANTES de mover qualquer nó: document.scripts, depois do
    // merge, passaria a incluir os scripts do PRÓPRIO Next (chunks de
    // hidratação) — o laço de recriação abaixo só deve reexecutar os scripts
    // que vieram deste bundle.
    const bundleScripts = Array.from(doc.querySelectorAll("script"));
    const legacyRoot = document.getElementById("ag-legacy-root");
    if (!legacyRoot) {
      throw new Error("#ag-legacy-root não encontrado — app/page.tsx precisa renderizá-lo.");
    }
    // O único conteúdo que sobra em <head> depois do trim é a tag <script> do
    // runtime compilado (dc-runtime) — NÃO vai para document.head. O Next
    // App Router gerencia o <head> real via React (streaming de metadata:
    // title, OG, canonical), e um appendChild direto nele — bypassando o
    // React — deixou esse mecanismo confuso e espalhou <title>/<meta> para
    // dentro de <body> no primeiro reconcile seguinte, quebrando SEO/OG a
    // troco de nada: um <script src> executa igual em qualquer lugar do
    // documento, então ele entra dentro de #ag-legacy-root — que já está
    // isolado do React via dangerouslySetInnerHTML (mesmo motivo do
    // comentário logo abaixo, sobre <body>) — junto com o resto.
    while (doc.head.firstChild) legacyRoot.appendChild(doc.head.firstChild);
    while (doc.body.firstChild) legacyRoot.appendChild(doc.body.firstChild);

    // Aviso conhecido, não corrigido aqui: uma vez que o runtime compilado
    // (dc-runtime, dentro do <script> acima) termina de bootar, ELE PRÓPRIO
    // chama document.head.appendChild/prepend algumas vezes (injeta o
    // <style> base do helmet, por exemplo) — fora do controle deste arquivo,
    // porque é código de terceiro, minificado, sem fonte no repositório. Como
    // o React do Next também gerencia esse <head> (streaming de metadata),
    // essas inserções por fora do React às vezes fazem o próximo reconcile
    // "devolver" os nós de <title>/<meta> como filhos de <body> em vez de
    // <head> — confirmado que é só cosmético: o HTML bruto que qualquer
    // crawler ou unfurler (WhatsApp, Twitter) lê continua com o <head>
    // correto (isso acontece só no cliente, depois da hidratação), e
    // document.title/querySelector('meta[property=...]') resolvem certo de
    // qualquer jeito — HTML5 não exige <meta>/<title> dentro de <head> para
    // serem encontrados via DOM. Não há correção segura sem reescrever o
    // dc-runtime compilado.

    // Resolve page-frame markers: mint this document's own blob for each
    // framed page — from local text when this is the root, otherwise by
    // asking the direct parent over the relay protocol above. An
    // unanswered request leaves the frame on about:blank, the same
    // degraded state as a refused embed.
    {
      const MARKER =
        /^about:blank#([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(#.*)?$/;
      const needed = [];
      for (const el of Array.from(document.querySelectorAll("iframe"))) {
        const m = MARKER.exec(el.getAttribute("src") || "");
        if (!m) continue;
        const text = pageTexts[m[1]];
        if (typeof text === "string") {
          mountPage(el, m[2] || "", text);
        } else if (window.parent !== window && !isPageRoot) {
          const had = pendingFrames[m[1]];
          (pendingFrames[m[1]] = had || []).push({ el: el, frag: m[2] || "" });
          if (!had) needed.push(m[1]);
        }
      }
      for (const uuid of needed) {
        window.parent.postMessage({ __bundler_need: uuid }, OWN_TARGET);
      }
    }

    const dead = bundleScripts;
    for (const old of dead) {
      const s = document.createElement("script");
      for (const a of old.attributes) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      if ((s.type === "text/babel" || s.type === "text/jsx") && s.src) {
        const pre = resourceBlobs[s.src.split("#")[0]];
        s.textContent = pre ? await pre.text() : await (await fetch(s.src)).text();
        s.removeAttribute("src");
      }
      const p = s.src ? new Promise(function (r) { s.onload = s.onerror = r; }) : null;
      old.replaceWith(s);
      if (p) await p;
    }
    if (window.Babel && typeof window.Babel.transformScriptTags === "function") {
      window.Babel.transformScriptTags();
    }
  } catch (err) {
    console.error("[bundle] legacy mount error:", err);
  }
})();
