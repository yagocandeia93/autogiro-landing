/**
 * Máscara de WhatsApp no padrão brasileiro: (99) 99999-9999 (celular, 11
 * dígitos) ou (99) 9999-9999 (fixo, 10 dígitos) — aceita os dois enquanto
 * digita, porque nem todo dono de oficina vai cadastrar um celular.
 */
export function maskBRPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);

  if (rest.length <= 4) {
    return `(${ddd}) ${rest}`;
  }
  if (digits.length <= 10) {
    // fixo: (99) 9999-9999
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  // celular: (99) 99999-9999
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
}

/** 10 dígitos (fixo) ou 11 (celular), DDD incluído. */
export function isValidBRPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}
