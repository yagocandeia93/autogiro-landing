/**
 * Modal de captura de lead da landing — atende os DOIS funis:
 *
 *   [data-ag-demo]              → "Agendar demonstração" (origem=demonstracao)
 *   [data-ag-signup="BASICO"]   → "Assinar agora"        (origem=plano)
 *   [data-ag-signup="PRO"]      → "Começar agora"        (origem=plano)
 *
 * Os botões de plano abriam /inscricao, uma página isolada com verificação de
 * e-mail por código de 6 dígitos. Cada passo a mais era um lead a menos: sair
 * da landing, esperar um e-mail, voltar e digitar o código. Agora os dois
 * funis terminam aqui, na própria landing, com Turnstile como única barreira
 * anti-robô — o mesmo formulário (Nome, E-mail, WhatsApp, Nome da loja), com
 * o plano vindo do botão clicado em vez de a pessoa escolher de novo.
 *
 * Por que este arquivo existe separado: o miolo da landing é o bundle
 * exportado do Claude Design, cujo HTML real mora numa string JSON dentro de
 * uma <script type="__bundler/template"> (public/legacy-content.html). Enfiar
 * o modal ali dentro deixaria ~600 linhas de JS impossíveis de ler, revisar ou
 * lintar. O bundle só ganha `data-ag-demo`/`data-ag-signup` nos CTAs e uma tag
 * <script> apontando para cá.
 *
 * Duas decisões que dependem de como o bundle funciona:
 *
 * 1. O clique é capturado por DELEGAÇÃO no document, não por listener nos
 *    botões. O componente DCLogic do bundle re-renderiza a própria subárvore a
 *    cada setState (mexer nos sliders da calculadora já faz isso), o que
 *    descartaria qualquer listener preso nos elementos.
 * 2. O modal é anexado ao document.body, FORA de <x-dc>, pelo mesmo motivo —
 *    dentro, um re-render o apagaria no meio do preenchimento.
 *
 * O submit bate em /api/signup-intent, que valida Turnstile + rate limit e
 * avisa a equipe (Resend). Não existe etapa nenhuma depois do envio.
 */
(function () {
  "use strict";

  var ENDPOINT = "/api/signup-intent";
  var CONFIG_ENDPOINT = "/api/turnstile-config";
  var TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  var AUTO_CLOSE_MS = 5000;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var PLAN_LABEL = { BASICO: "Básico", PRO: "Pro" };
  var PLAN_PRICE = { BASICO: "R$ 299", PRO: "R$ 499" };

  /**
   * Textos por funil. `plano` recebe o plano escolhido no botão, então o
   * conteúdo é função dele; `demonstracao` ignora o argumento.
   *
   * Nenhuma das duas variantes promete cobrança nesta etapa: o gateway de
   * pagamento (Muro 1) ainda não existe, e quem clica em "Assinar agora"
   * termina com um consultor concluindo a ativação. Prometer um checkout que
   * não existe seria pior do que o passo a mais que acabou de ser removido.
   */
  var VARIANTS = {
    demonstracao: {
      eyebrow: function () {
        return "Demonstração gratuita";
      },
      title: function () {
        return "Trinta minutos com o seu estoque na tela.";
      },
      sub: function () {
        return (
          "Um consultor mostra a margem real de três carros da sua loja " +
          "durante a própria reunião. O contato é feito em até 1 dia útil."
        );
      },
      submitLabel: function () {
        return "Quero uma demonstração";
      },
      legal: function () {
        return "Usamos seus dados apenas para preparar e agendar a demonstração.";
      },
      okText: function () {
        return (
          "Um consultor entra em contato pelo WhatsApp em até 1 dia útil " +
          "para agendar a demonstração."
        );
      },
    },
    plano: {
      eyebrow: function (plan) {
        return "Plano " + PLAN_LABEL[plan] + " · " + PLAN_PRICE[plan] + "/mês";
      },
      title: function () {
        return "Falta só um passo para ativar sua loja.";
      },
      sub: function (plan) {
        return (
          "Deixe seus dados e um consultor conclui a ativação do plano " +
          PLAN_LABEL[plan] +
          " com você em até 1 dia útil — implantação acompanhada, " +
          "sem taxa de setup e sem fidelidade."
        );
      },
      submitLabel: function (plan) {
        return "Quero o plano " + PLAN_LABEL[plan];
      },
      legal: function () {
        return "Nenhuma cobrança acontece agora: a assinatura é fechada com o consultor.";
      },
      okText: function (plan) {
        return (
          "Um consultor entra em contato pelo WhatsApp em até 1 dia útil " +
          "para ativar sua loja no plano " +
          PLAN_LABEL[plan] +
          "."
        );
      },
    },
  };

  // ── estado do módulo ─────────────────────────────────────────────────────
  var root = null; // container do modal (criado na primeira abertura)
  var els = {}; // referências dos nós internos
  var isOpen = false;
  var status = "form"; // 'form' | 'submitting' | 'success'
  var lastTrigger = null; // devolve o foco ao fechar
  var autoCloseTimer = null;
  var variant = "demonstracao"; // funil da abertura atual
  var plan = null; // 'BASICO' | 'PRO' — só no funil de plano

  var turnstile = {
    siteKey: undefined, // undefined = não consultado; null = não configurado
    widgetId: null,
    token: null,
    loading: false,
    submitWhenReady: false,
  };

  // ── máscara de telefone (mesmo formato que o servidor valida) ────────────
  function maskBRPhone(value) {
    var digits = value.replace(/\D/g, "").slice(0, 11);
    if (!digits) return "";
    if (digits.length <= 2) return "(" + digits;

    var ddd = digits.slice(0, 2);
    var rest = digits.slice(2);

    if (rest.length <= 4) return "(" + ddd + ") " + rest;
    if (digits.length <= 10) {
      return "(" + ddd + ") " + rest.slice(0, 4) + "-" + rest.slice(4);
    }
    return "(" + ddd + ") " + rest.slice(0, 5) + "-" + rest.slice(5, 9);
  }

  function phoneDigits(value) {
    return value.replace(/\D/g, "");
  }

  // ── CSS ──────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("agm-styles")) return;
    var css = [
      ".agm-overlay{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,7,12,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .18s ease}",
      // display:flex acima sobrepõe o `display:none` que o browser aplica a
      // [hidden]. Sem esta regra o overlay fechado continua ocupando a tela
      // inteira e engole todo clique da página.
      ".agm-overlay[hidden]{display:none}",
      // Enquanto não está totalmente aberto (inclusive nos 200ms de fade-out)
      // o overlay não deve capturar clique nenhum.
      ".agm-overlay:not([data-shown]){pointer-events:none}",
      ".agm-overlay[data-shown]{opacity:1}",
      ".agm-dialog{position:relative;width:100%;max-width:460px;max-height:calc(100vh - 32px);overflow-y:auto;background:#111823;border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:26px;color:#e9edf3;font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 40px 90px -40px rgba(0,0,0,.9);transform:translateY(8px) scale(.99);transition:transform .18s cubic-bezier(.16,1,.3,1)}",
      ".agm-overlay[data-shown] .agm-dialog{transform:none}",
      ".agm-close{position:absolute;top:14px;right:14px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#94a1b5;font-size:18px;line-height:1;cursor:pointer;transition:color .2s,border-color .2s}",
      ".agm-close:hover{color:#fff;border-color:rgba(255,255,255,.3)}",
      ".agm-eyebrow{margin:0 0 6px;font-size:11.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#f5a524}",
      ".agm-title{margin:0 0 8px;font-size:20px;font-weight:700;letter-spacing:-.02em;padding-right:34px}",
      ".agm-sub{margin:0 0 20px;font-size:14px;line-height:1.55;color:#94a1b5}",
      ".agm-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}",
      ".agm-field label{font-size:12.5px;font-weight:500;color:#b3bdcc}",
      ".agm-field input{background:#0a0e14;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:11px 12px;font:inherit;font-size:14.5px;color:#e9edf3;width:100%}",
      ".agm-field input::placeholder{color:#6b7889}",
      ".agm-field input:focus{outline:none;border-color:#f5a524;box-shadow:0 0 0 3px rgba(245,165,36,.15)}",
      ".agm-field input[aria-invalid='true']{border-color:#f87171}",
      ".agm-err{font-size:12px;color:#f87171;min-height:0}",
      ".agm-turnstile{margin:4px 0 14px;min-height:0}",
      ".agm-submit{width:100%;background:#f5a524;color:#1b1305;border:none;border-radius:10px;padding:13px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s,transform .12s}",
      ".agm-submit:hover:not(:disabled){background:#ffb640}",
      ".agm-submit:active:not(:disabled){transform:translateY(1px)}",
      ".agm-submit:disabled{opacity:.68;cursor:progress}",
      ".agm-spin{display:inline-block;width:13px;height:13px;margin-right:8px;vertical-align:-1px;border:2px solid rgba(27,19,5,.35);border-top-color:#1b1305;border-radius:50%;animation:agm-rot .7s linear infinite}",
      "@keyframes agm-rot{to{transform:rotate(360deg)}}",
      ".agm-formerr{margin:12px 0 0;font-size:13px;line-height:1.5;color:#f87171;text-align:center}",
      ".agm-legal{margin:12px 0 0;font-size:12px;line-height:1.5;color:#7c8899;text-align:center}",
      ".agm-ok{display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 0 4px}",
      // Mesmo motivo da regra do overlay: sem isto o display:flex acima vence o
      // [hidden] e o painel de sucesso fica visível embaixo do formulário.
      ".agm-ok[hidden]{display:none}",
      ".agm-ok-badge{width:46px;height:46px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;border-radius:50%;background:rgba(245,165,36,.14);border:1px solid rgba(245,165,36,.45);color:#f5a524;font-size:22px;line-height:1}",
      ".agm-ok-title{margin:0 0 8px;font-size:18px;font-weight:700}",
      ".agm-ok-text{margin:0 0 6px;font-size:14px;line-height:1.6;color:#94a1b5;max-width:34ch}",
      ".agm-ok-hint{margin:14px 0 0;font-size:12px;color:#6b7889}",
      "@media (max-width:520px){.agm-dialog{padding:22px 18px;border-radius:12px}.agm-title{font-size:18.5px}}",
      "@media (prefers-reduced-motion:reduce){.agm-overlay,.agm-dialog{transition:none}.agm-spin{animation-duration:1.4s}}",
    ].join("");

    var style = document.createElement("style");
    style.id = "agm-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── construção do modal ──────────────────────────────────────────────────
  var FIELDS = [
    { name: "nome", label: "Nome", type: "text", placeholder: "Seu nome completo", autocomplete: "name" },
    { name: "email", label: "E-mail", type: "email", placeholder: "voce@sualoja.com.br", autocomplete: "email" },
    { name: "whatsapp", label: "WhatsApp", type: "tel", placeholder: "(00) 00000-0000", autocomplete: "tel" },
    { name: "loja", label: "Nome da loja", type: "text", placeholder: "Como sua revenda é conhecida", autocomplete: "organization" },
  ];

  function build() {
    injectStyles();

    root = document.createElement("div");
    root.className = "agm-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "agm-title");
    root.hidden = true;

    var camposHtml = FIELDS.map(function (f) {
      return (
        '<div class="agm-field">' +
        '<label for="agm-' + f.name + '">' + f.label + "</label>" +
        '<input id="agm-' + f.name + '" name="' + f.name + '" type="' + f.type +
        '" placeholder="' + f.placeholder + '" autocomplete="' + f.autocomplete +
        '" aria-describedby="agm-err-' + f.name + '">' +
        '<span class="agm-err" id="agm-err-' + f.name + '" aria-live="polite"></span>' +
        "</div>"
      );
    }).join("");

    root.innerHTML =
      '<div class="agm-dialog">' +
      '<button type="button" class="agm-close" aria-label="Fechar">&#10005;</button>' +
      '<div class="agm-panel-form">' +
      '<p class="agm-eyebrow"></p>' +
      '<h2 class="agm-title" id="agm-title"></h2>' +
      '<p class="agm-sub"></p>' +
      '<form novalidate>' +
      camposHtml +
      '<div class="agm-turnstile"></div>' +
      '<button type="submit" class="agm-submit"></button>' +
      '<p class="agm-formerr" role="alert" hidden></p>' +
      '<p class="agm-legal"></p>' +
      "</form>" +
      "</div>" +
      '<div class="agm-panel-ok agm-ok" hidden>' +
      '<div class="agm-ok-badge" aria-hidden="true">&#10003;</div>' +
      '<h2 class="agm-ok-title"></h2>' +
      '<p class="agm-ok-text"></p>' +
      '<p class="agm-ok-hint"></p>' +
      "</div>" +
      "</div>";

    els.dialog = root.querySelector(".agm-dialog");
    els.eyebrow = root.querySelector(".agm-eyebrow");
    els.title = root.querySelector(".agm-title");
    els.sub = root.querySelector(".agm-sub");
    els.legal = root.querySelector(".agm-legal");
    els.panelForm = root.querySelector(".agm-panel-form");
    els.panelOk = root.querySelector(".agm-panel-ok");
    els.form = root.querySelector("form");
    els.submit = root.querySelector(".agm-submit");
    els.formErr = root.querySelector(".agm-formerr");
    els.turnstileBox = root.querySelector(".agm-turnstile");
    els.okTitle = root.querySelector(".agm-ok-title");
    els.okText = root.querySelector(".agm-ok-text");
    els.okHint = root.querySelector(".agm-ok-hint");
    els.inputs = {};
    els.errors = {};
    FIELDS.forEach(function (f) {
      els.inputs[f.name] = root.querySelector("#agm-" + f.name);
      els.errors[f.name] = root.querySelector("#agm-err-" + f.name);
    });

    // Máscara enquanto digita, no mesmo formato que o backend valida.
    els.inputs.whatsapp.addEventListener("input", function () {
      var pos = this.value.length;
      this.value = maskBRPhone(this.value);
      // Só reposiciona o cursor quando o texto foi digitado no fim, senão
      // editar o meio do número jogaria o cursor para o final a cada tecla.
      if (pos >= this.value.length) {
        this.setSelectionRange(this.value.length, this.value.length);
      }
    });

    // Limpa o erro do campo ao corrigir, sem revalidar tudo.
    FIELDS.forEach(function (f) {
      els.inputs[f.name].addEventListener("input", function () {
        if (els.errors[f.name].textContent) setFieldError(f.name, "");
      });
    });

    root.querySelector(".agm-close").addEventListener("click", close);
    root.addEventListener("mousedown", function (e) {
      // Fecha só no clique fora do diálogo, e nunca durante o envio.
      if (e.target === root && status !== "submitting") close();
    });
    els.form.addEventListener("submit", onSubmit);
    els.dialog.addEventListener("keydown", trapTab);

    // Todo o texto variável (eyebrow, título, subtítulo, aviso legal e o
    // rótulo do botão) é escrito por applyVariant/setStatus a cada abertura —
    // o markup acima nasce com esses nós vazios de propósito, para não existir
    // uma cópia do texto de demonstração que envelhece sozinha no HTML.
    applyVariant();

    document.body.appendChild(root);
  }

  // ── validação ────────────────────────────────────────────────────────────
  function setFieldError(name, msg) {
    els.errors[name].textContent = msg || "";
    if (msg) els.inputs[name].setAttribute("aria-invalid", "true");
    else els.inputs[name].removeAttribute("aria-invalid");
  }

  function validate() {
    var v = values();
    var errs = {};

    if (v.nome.length < 2) errs.nome = "Informe seu nome completo.";
    if (!EMAIL_RE.test(v.email)) errs.email = "Informe um e-mail válido.";

    var d = phoneDigits(v.whatsapp);
    if (d.length !== 10 && d.length !== 11) {
      errs.whatsapp = "Informe um WhatsApp válido, com DDD.";
    }
    if (v.loja.length < 2) errs.loja = "Informe o nome da sua loja.";

    FIELDS.forEach(function (f) {
      setFieldError(f.name, errs[f.name]);
    });

    var first = FIELDS.filter(function (f) {
      return errs[f.name];
    })[0];
    if (first) els.inputs[first.name].focus();

    return !first;
  }

  function values() {
    return {
      nome: els.inputs.nome.value.trim(),
      email: els.inputs.email.value.trim(),
      whatsapp: els.inputs.whatsapp.value,
      loja: els.inputs.loja.value.trim(),
    };
  }

  // ── Turnstile ────────────────────────────────────────────────────────────
  function loadTurnstile() {
    if (turnstile.siteKey !== undefined || turnstile.loading) return;
    turnstile.loading = true;

    fetch(CONFIG_ENDPOINT, { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.ok ? r.json() : { siteKey: null };
      })
      .catch(function () {
        return { siteKey: null };
      })
      .then(function (cfg) {
        turnstile.siteKey = cfg && cfg.siteKey ? cfg.siteKey : null;
        turnstile.loading = false;

        if (!turnstile.siteKey) {
          // Turnstile não configurado: o servidor decide se aceita (só em dev).
          if (turnstile.submitWhenReady) {
            turnstile.submitWhenReady = false;
            send();
          }
          return;
        }
        injectTurnstileScript();
      });
  }

  function injectTurnstileScript() {
    if (window.turnstile) {
      renderWidget();
      return;
    }
    var existing = document.querySelector('script[src="' + TURNSTILE_SRC + '"]');
    if (existing) {
      existing.addEventListener("load", renderWidget);
      return;
    }
    var s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    s.addEventListener("load", renderWidget);
    document.head.appendChild(s);
  }

  function renderWidget() {
    if (!window.turnstile || turnstile.widgetId !== null || !els.turnstileBox) return;
    turnstile.widgetId = window.turnstile.render(els.turnstileBox, {
      sitekey: turnstile.siteKey,
      theme: "dark",
      callback: function (token) {
        turnstile.token = token;
        if (turnstile.submitWhenReady) {
          turnstile.submitWhenReady = false;
          send();
        }
      },
      "expired-callback": function () {
        turnstile.token = null;
      },
      "error-callback": function () {
        turnstile.token = null;
        if (turnstile.submitWhenReady) {
          turnstile.submitWhenReady = false;
          setStatus("form");
          showFormError(
            "Não conseguimos completar a verificação anti-robô. Atualize a página e tente novamente."
          );
        }
      },
    });
  }

  /** Token do Turnstile é de uso único: depois de enviar, pede um novo. */
  function resetTurnstile() {
    turnstile.token = null;
    if (window.turnstile && turnstile.widgetId !== null) {
      try {
        window.turnstile.reset(turnstile.widgetId);
      } catch (e) {
        /* widget já descartado — o próximo render cuida disso */
      }
    }
  }

  // ── envio ────────────────────────────────────────────────────────────────
  function setStatus(next) {
    status = next;
    if (next === "submitting") {
      els.submit.disabled = true;
      els.submit.innerHTML = '<span class="agm-spin"></span>Enviando...';
    } else {
      els.submit.disabled = false;
      els.submit.textContent = copy("submitLabel");
    }
  }

  function showFormError(msg) {
    els.formErr.textContent = msg;
    els.formErr.hidden = !msg;
  }

  function onSubmit(e) {
    e.preventDefault();
    if (status === "submitting") return;

    showFormError("");
    if (!validate()) return;

    setStatus("submitting");

    // Turnstile ainda carregando ou sem token: marca para enviar assim que
    // resolver, em vez de falhar na cara de quem preencheu tudo.
    if (turnstile.siteKey === undefined) {
      turnstile.submitWhenReady = true;
      loadTurnstile();
      return;
    }
    if (turnstile.siteKey && !turnstile.token) {
      turnstile.submitWhenReady = true;
      renderWidget();
      return;
    }

    send();
  }

  function send() {
    var v = values();
    setStatus("submitting");

    var payload = {
      nome: v.nome,
      email: v.email,
      whatsapp: v.whatsapp,
      loja: v.loja,
      origem: variant,
    };
    // O plano vem do botão clicado, não de uma escolha repetida dentro do
    // modal: quem clicou em "Começar agora" no card do Pro já escolheu.
    if (variant === "plano") payload.plan = plan;
    if (turnstile.token) payload.turnstileToken = turnstile.token;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { res: res, data: data };
          });
      })
      .then(function (out) {
        // O token foi consumido nesta tentativa, deu certo ou não.
        resetTurnstile();

        if (out.res.ok && out.data && out.data.ok) {
          succeed(v.nome);
          return;
        }
        setStatus("form");
        showFormError(
          (out.data && out.data.message) ||
            "Não conseguimos enviar seu pedido agora. Tente novamente em instantes."
        );
      })
      .catch(function () {
        resetTurnstile();
        setStatus("form");
        showFormError(
          "Falha de conexão. Confira sua internet e tente novamente."
        );
      });
  }

  function succeed(nome) {
    setStatus("success");
    var primeiro = nome.split(/\s+/)[0];

    els.okTitle.textContent = "Pedido recebido, " + primeiro + "!";
    els.okText.textContent = copy("okText");
    els.okHint.textContent = "Esta janela fecha sozinha em instantes.";

    els.panelForm.hidden = true;
    els.panelOk.hidden = false;
    els.dialog.querySelector(".agm-close").focus();

    autoCloseTimer = setTimeout(close, AUTO_CLOSE_MS);
  }

  // ── variante (funil) ─────────────────────────────────────────────────────
  /** Texto da variante atual, já resolvido para o plano escolhido. */
  function copy(key) {
    return VARIANTS[variant][key](plan);
  }

  /** Escreve no DOM todo o texto que depende da variante/plano. */
  function applyVariant() {
    els.eyebrow.textContent = copy("eyebrow");
    els.title.textContent = copy("title");
    els.sub.textContent = copy("sub");
    els.legal.textContent = copy("legal");
    // Reescreve o rótulo do botão (e devolve o formulário ao estado ocioso).
    setStatus(status === "submitting" ? "form" : status);
  }

  // ── abrir / fechar ───────────────────────────────────────────────────────
  /**
   * `nextVariant`/`nextPlan` vêm do CTA clicado. A mesma pessoa abre o modal
   * pelo Pro, fecha, e reabre pelo Básico ou pela demonstração — por isso o
   * texto é reescrito a cada abertura, e não uma vez na construção.
   */
  function open(trigger, nextVariant, nextPlan) {
    if (isOpen) return;

    variant = nextVariant || "demonstracao";
    plan = nextPlan || null;

    if (!root) build(); // build() já aplica a variante recém-definida
    lastTrigger = trigger || null;
    isOpen = true;

    // Volta ao formulário limpo se a última abertura terminou em sucesso;
    // caso contrário, o que a pessoa já digitou continua lá, só o texto da
    // variante muda.
    if (status === "success") reset();
    else applyVariant();

    root.hidden = false;
    document.body.style.overflow = "hidden";
    // Força um frame antes da transição de entrada.
    requestAnimationFrame(function () {
      root.setAttribute("data-shown", "");
    });

    document.addEventListener("keydown", onKeydown, true);
    loadTurnstile();
    els.inputs.nome.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;

    root.removeAttribute("data-shown");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKeydown, true);

    var hide = function () {
      if (!isOpen) root.hidden = true;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) hide();
    else setTimeout(hide, 200);

    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
    lastTrigger = null;
  }

  function reset() {
    FIELDS.forEach(function (f) {
      els.inputs[f.name].value = "";
      setFieldError(f.name, "");
    });
    showFormError("");
    els.panelOk.hidden = true;
    els.panelForm.hidden = false;
    status = "form";
    applyVariant();
    resetTurnstile();
  }

  function onKeydown(e) {
    if (e.key === "Escape" && status !== "submitting") {
      e.preventDefault();
      close();
    }
  }

  function trapTab(e) {
    if (e.key !== "Tab") return;
    var focusable = els.dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])'
    );
    var visible = Array.prototype.filter.call(focusable, function (el) {
      return el.offsetParent !== null;
    });
    if (!visible.length) return;

    var first = visible[0];
    var last = visible[visible.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ── gatilho ──────────────────────────────────────────────────────────────
  // Delegação no document: sobrevive aos re-renders do DCLogic. Um único
  // listener atende os dois funis — o atributo do CTA diz qual é.
  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;

    var signup = e.target.closest("[data-ag-signup]");
    if (signup) {
      e.preventDefault();
      var chosen = signup.getAttribute("data-ag-signup");
      // Plano desconhecido no atributo cairia no funil de plano sem plano
      // nenhum, e o servidor recusaria o envio depois de a pessoa preencher
      // tudo. Na dúvida, BASICO — é o que o servidor também assume como piso.
      open(signup, "plano", PLAN_LABEL[chosen] ? chosen : "BASICO");
      return;
    }

    var demo = e.target.closest("[data-ag-demo]");
    if (!demo) return;
    e.preventDefault();
    open(demo, "demonstracao", null);
  });

  // Exposto para depuração no console e para um eventual gatilho externo.
  window.agLeadModal = { open: open, close: close };
})();
