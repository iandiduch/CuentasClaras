export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeCurrency(value: string | undefined): string {
  return (value ?? "ARS").trim().toUpperCase();
}

export function normalizeDigits(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  return digits.length ? digits : null;
}

export function normalizeCuil(value: string | undefined | null): string | null {
  const digits = normalizeDigits(value);
  return digits && digits.length === 11 ? digits : null;
}

export function normalizeCvu(value: string | undefined | null): string | null {
  const digits = normalizeDigits(value);
  return digits && digits.length === 22 ? digits : null;
}

