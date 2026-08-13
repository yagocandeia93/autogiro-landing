"use client";

import { useEffect, useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { maskBRPhone, isValidBRPhone } from "@/lib/phoneMask";

type Plan = "BASICO" | "PRO";
type Stage = "form" | "otp" | "done";

type FieldErrors = Partial<Record<"nome" | "email" | "whatsapp", string>>;

type FormStatus =
  | { kind: "idle" }
  | { kind: "checking-turnstile" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

type OtpStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

const PLAN_LABEL: Record<Plan, string> = {
  BASICO: "Básico",
  PRO: "Pro",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm({ plan }: { plan: Plan }) {
  const [stage, setStage] = useState<Stage>("form");
  const [doneMessage, setDoneMessage] = useState("");

  // --- Etapa 1: dados iniciais (Muro 3) ---
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<FormStatus>({ kind: "idle" });

  // --- Etapa 2: código OTP (Muro 2) ---
  const [otp, setOtp] = useState("");
  const [otpStatus, setOtpStatus] = useState<OtpStatus>({ kind: "idle" });

  function validate(): boolean {
    const next: FieldErrors = {};
    if (nome.trim().length < 2) {
      next.nome = "Informe seu nome completo.";
    }
    if (!EMAIL_RE.test(email.trim())) {
      next.email = "Informe um e-mail válido.";
    }
    if (!isValidBRPhone(whatsapp)) {
      next.whatsapp = "Informe um WhatsApp válido, com DDD.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 1) Valida os 3 campos ANTES de depender do Turnstile — não faz
    // sentido cobrar verificação anti-bot de alguém que ainda nem
    // preencheu o formulário direito.
    if (!validate()) return;

    // 2) Só a partir daqui o Turnstile entra em jogo. Ele carrega em
    // paralelo desde que a página abriu (ver TurnstileWidget), então na
    // prática o token já deve estar pronto quando o usuário termina de
    // digitar — mas se não estiver, espera em vez de falhar.
    if (!turnstileToken) {
      setFormStatus({ kind: "checking-turnstile" });
      return;
    }

    await submitForm(turnstileToken);
  }

  async function submitForm(token: string) {
    setFormStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/signup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim(),
          whatsapp,
          plan,
          turnstileToken: token,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setFormStatus({
          kind: "error",
          message:
            data.message ??
            "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.",
        });
        return;
      }

      if (res.status === 400 && data.error === "turnstile_failed") {
        setFormStatus({
          kind: "error",
          message:
            data.message ??
            "Não conseguimos confirmar que você não é um robô. Atualize a página e tente novamente.",
        });
        return;
      }

      if (!res.ok) {
        setFormStatus({
          kind: "error",
          message: data.message ?? "Não foi possível concluir agora. Tente novamente em instantes.",
        });
        return;
      }

      // Sucesso: o e-mail com o código já foi disparado. Vai pra etapa 2.
      setFormStatus({ kind: "idle" });
      setStage("otp");
    } catch {
      setFormStatus({
        kind: "error",
        message: "Falha de conexão. Verifique sua internet e tente novamente.",
      });
    }
  }

  // Se o usuário terminou de preencher e ficou esperando o Turnstile
  // (status "checking-turnstile"), assim que o token chegar, envia sozinho.
  // Efeito, não chamada direta no corpo do render — envio é um side effect.
  useEffect(() => {
    if (formStatus.kind === "checking-turnstile" && turnstileToken) {
      submitForm(turnstileToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formStatus.kind, turnstileToken]);

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      setOtpStatus({ kind: "error", message: "O código tem 6 dígitos." });
      return;
    }

    setOtpStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setOtpStatus({
          kind: "error",
          message: data.message ?? "Código incorreto. Tente novamente.",
        });
        // "Sem lead encontrado" ou "muitas tentativas" — não adianta
        // insistir no código, precisa recomeçar do formulário.
        if (data.error === "expired_or_not_found" || data.error === "too_many_attempts") {
          setStage("form");
          setTurnstileToken(null);
        }
        return;
      }

      setDoneMessage(data.message ?? "E-mail verificado!");
      setStage("done");

      // Redireciona pro checkout (Muro 1). Enquanto o gateway não está
      // configurado, `checkoutUrl` aponta pra /checkout local, que só
      // explica que o pagamento ainda não está ligado.
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      setOtpStatus({
        kind: "error",
        message: "Falha de conexão. Verifique sua internet e tente novamente.",
      });
    }
  }

  if (stage === "done") {
    return (
      <div style={formStyle}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>Tudo certo!</p>
        <p style={{ margin: "8px 0 0", color: "#94a1b5", fontSize: 14.5, lineHeight: 1.5 }}>
          {doneMessage}
        </p>
        <p style={{ margin: "8px 0 0", color: "#7c8899", fontSize: 13 }}>
          Te levando para o pagamento...
        </p>
      </div>
    );
  }

  if (stage === "otp") {
    const isBusy = otpStatus.kind === "submitting";
    return (
      <form onSubmit={handleVerifyOtp} noValidate style={formStyle}>
        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#f5a524", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Verificação por e-mail
        </p>
        <p style={{ margin: "0 0 20px", fontSize: 14.5, color: "#94a1b5", lineHeight: 1.5 }}>
          Enviamos um código de 6 dígitos para <strong style={{ color: "#e9edf3" }}>{email}</strong>. Confira sua caixa de entrada (e o spam).
        </p>

        <Field label="Código de verificação">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            style={{ ...inputStyle, letterSpacing: "0.3em", textAlign: "center", fontSize: 20 }}
            disabled={isBusy}
          />
        </Field>

        <button type="submit" disabled={isBusy} style={buttonStyle(isBusy)}>
          {isBusy ? "Verificando..." : "Verificar código"}
        </button>

        {otpStatus.kind === "error" && (
          <p style={{ color: "#ff8080", fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>
            {otpStatus.message}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setStage("form");
            setOtp("");
            setOtpStatus({ kind: "idle" });
          }}
          style={linkButtonStyle}
        >
          Errei o e-mail, voltar
        </button>
      </form>
    );
  }

  const isBusy = formStatus.kind === "submitting" || formStatus.kind === "checking-turnstile";

  return (
    <form onSubmit={handleSubmit} noValidate style={formStyle}>
      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#f5a524", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Plano {PLAN_LABEL[plan]}
      </p>
      <p style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600 }}>
        Só mais um passo pra começar.
      </p>

      <Field label="Nome" error={errors.nome}>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Seu nome completo"
          style={inputStyle}
          disabled={isBusy}
        />
      </Field>

      <Field label="E-mail" error={errors.email}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@suaempresa.com.br"
          style={inputStyle}
          disabled={isBusy}
        />
      </Field>

      <Field label="WhatsApp" error={errors.whatsapp}>
        <input
          type="tel"
          inputMode="numeric"
          value={whatsapp}
          onChange={(e) => setWhatsapp(maskBRPhone(e.target.value))}
          placeholder="(00) 00000-0000"
          style={inputStyle}
          disabled={isBusy}
        />
      </Field>

      <div style={{ margin: "4px 0 16px" }}>
        <TurnstileWidget onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
      </div>

      <button type="submit" disabled={isBusy} style={buttonStyle(isBusy)}>
        {formStatus.kind === "submitting"
          ? "Aguarde..."
          : formStatus.kind === "checking-turnstile"
            ? "Confirmando segurança..."
            : "Continuar"}
      </button>

      {formStatus.kind === "error" && (
        <p style={{ color: "#ff8080", fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>
          {formStatus.message}
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "#b3bdcc", marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && (
        <p style={{ color: "#ff8080", fontSize: 12.5, margin: "6px 0 0" }}>{error}</p>
      )}
    </div>
  );
}

const formStyle: React.CSSProperties = {
  background: "#111823",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 14,
  padding: 26,
  maxWidth: 420,
  width: "100%",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: "#e9edf3",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0a0e14",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 14.5,
  color: "#e9edf3",
  boxSizing: "border-box",
};

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "13px",
    borderRadius: 10,
    border: "none",
    background: disabled ? "#8a6a26" : "#f5a524",
    color: "#1b1305",
    fontSize: 14.5,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const linkButtonStyle: React.CSSProperties = {
  display: "block",
  margin: "14px auto 0",
  background: "none",
  border: "none",
  color: "#7c8899",
  fontSize: 12.5,
  textDecoration: "underline",
  cursor: "pointer",
};
