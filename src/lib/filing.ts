/**
 * Código y plazo de las hojas de reclamación y solicitudes ARCO, generados en
 * el navegador (no hay backend). Mismo cálculo que tenía leads-service.
 */

/** Plazos legales en días hábiles. */
export const COMPLAINT_RESPONSE_BUSINESS_DAYS = 15;
export const PRIVACY_RESPONSE_BUSINESS_DAYS = 20;

/** shortcut: feriados nacionales de 2026 fijos; agregar los del año siguiente antes de que empiece. */
export const PERU_HOLIDAYS: ReadonlySet<string> = new Set([
  '2026-01-01', '2026-04-02', '2026-04-03', '2026-05-01', '2026-06-07', '2026-06-29', '2026-07-23', '2026-07-28',
  '2026-07-29', '2026-08-06', '2026-08-30', '2026-10-08', '2026-11-01', '2026-12-08', '2026-12-09', '2026-12-25',
]);

// Perú es UTC-5 todo el año (sin horario de verano).
const OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function limaDateOf(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Suma días hábiles (lunes a viernes, sin feriados) contando desde el día de
 * Lima siguiente al de recepción; conserva la hora.
 */
export function addBusinessDays(instant: Date, days: number, holidays: ReadonlySet<string> = PERU_HOLIDAYS): Date {
  let cursor = limaDateOf(instant);
  let elapsed = 0;
  let counted = 0;
  while (counted < days) {
    cursor = new Date(Date.parse(`${cursor}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
    elapsed += 1;
    const weekday = new Date(`${cursor}T00:00:00.000Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(cursor)) counted += 1;
  }
  return new Date(instant.getTime() + elapsed * DAY_MS);
}

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Código legible, p. ej. SIS-LR-2026-7KQ4M.
 * shortcut: es aleatorio, no correlativo; si se exige numeración correlativa, hace falta un backend.
 */
export function makeFilingCode(kind: 'LR' | 'ARCO', now: Date = new Date()): string {
  const random = crypto.getRandomValues(new Uint8Array(5));
  const suffix = Array.from(random, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `SIS-${kind}-${limaDateOf(now).slice(0, 4)}-${suffix}`;
}

export interface Filing {
  code: string;
  receivedAt: Date;
  dueBy: Date;
}

export function newFiling(kind: 'LR' | 'ARCO', businessDays: number, now: Date = new Date()): Filing {
  return { code: makeFilingCode(kind, now), receivedAt: now, dueBy: addBusinessDays(now, businessDays) };
}
