/**
 * Conversión entre soles (lo que escribe la persona) y céntimos (lo que guarda
 * el contrato `MoneySchema`). Se trabaja con cadenas para no arrastrar errores
 * de coma flotante (0.1 + 0.2).
 */

const SOLES_PATTERN = /^(\d{1,7})(?:[.,](\d{1,2}))?$/;

/**
 * "249" → 24900, "249.9" → 24990, "1 249,50" → 124950.
 * Devuelve `null` si el texto no es un monto válido no negativo con hasta 2 decimales.
 */
export function solesToCents(input: string): number | null {
  const normalized = input.trim().replace(/^S\/\s*/i, '').replace(/\s/g, '');
  const match = SOLES_PATTERN.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  return whole * 100 + fraction;
}

/** 24990 → "249.90" (valor para un campo de formulario). */
export function centsToSoles(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new RangeError(`Monto en céntimos inválido: ${cents}`);
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

const SOLES_FORMAT = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 24990 → "S/ 249.90". */
export function formatSoles(cents: number): string {
  return SOLES_FORMAT.format(cents / 100);
}
