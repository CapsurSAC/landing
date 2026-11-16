/**
 * Fechas del panel en hora de Lima (America/Lima, UTC−05:00 todo el año: Perú
 * no aplica horario de verano). Los contratos viajan siempre en ISO UTC; los
 * formularios usan `datetime-local` / `date`, que no llevan zona horaria.
 */

export const LIMA_TZ = 'America/Lima';
const LIMA_OFFSET = '-05:00';
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** true si es una fecha YYYY-MM-DD real (rechaza 2026-02-30). */
export function isDateOnly(value: string): boolean {
  const m = DATE_ONLY.exec(value);
  return !!m && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** "2026-11-20T08:30" (hora de Lima) → "2026-11-20T13:30:00.000Z". `null` si no es válida. */
export function limaLocalToIso(local: string): string | null {
  const m = LOCAL_DATETIME.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  if (!isRealDate(Number(y), Number(mo), Number(d)) || Number(h) > 23 || Number(mi) > 59 || Number(s ?? 0) > 59) {
    return null;
  }
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}${LIMA_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** "2026-11-20T13:30:00.000Z" → "2026-11-20T08:30" (valor para `<input type="datetime-local">`). */
export function isoToLimaLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Fecha ISO inválida: ${iso}`);
  return new Date(date.getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 16);
}

/** Inicio del día en Lima en ISO UTC: "2026-11-01" → "2026-11-01T05:00:00.000Z". */
export function limaDayStartIso(day: string): string | null {
  if (!isDateOnly(day)) return null;
  return new Date(`${day}T00:00:00.000${LIMA_OFFSET}`).toISOString();
}

/** Fin del día en Lima en ISO UTC: "2026-11-01" → "2026-11-02T04:59:59.999Z". */
export function limaDayEndIso(day: string): string | null {
  if (!isDateOnly(day)) return null;
  return new Date(`${day}T23:59:59.999${LIMA_OFFSET}`).toISOString();
}

/** Día calendario de Lima (YYYY-MM-DD) de un instante. */
export function limaDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(d.getTime() - LIMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Suma días a una fecha YYYY-MM-DD. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Rango de los últimos `days` días calendario de Lima, incluido hoy:
 * desde las 00:00 de hace `days - 1` días hasta el instante actual.
 */
export function lastDaysRange(days: number, now: Date = new Date()): { from: string; to: string } {
  const today = limaDay(now);
  const fromDay = addDays(today, -(days - 1));
  return { from: limaDayStartIso(fromDay)!, to: now.toISOString() };
}

/**
 * Días calendario (Lima) que faltan hasta `dueIso`. 0 = vence hoy; negativo = vencido
 * hace N días. `overdue` es true en cuanto pasa el instante límite.
 */
export function daysUntil(dueIso: string, now: Date = new Date()): { days: number; overdue: boolean } {
  const due = new Date(dueIso);
  const dueDay = new Date(`${limaDay(due)}T00:00:00.000Z`).getTime();
  const today = new Date(`${limaDay(now)}T00:00:00.000Z`).getTime();
  return { days: Math.round((dueDay - today) / DAY_MS), overdue: due.getTime() < now.getTime() };
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-PE', {
  timeZone: LIMA_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DATE_FORMAT = new Intl.DateTimeFormat('es-PE', {
  timeZone: LIMA_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** "13/11/2026, 08:05" en hora de Lima. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE_TIME_FORMAT.format(d);
}

/** "13 nov 2026" en hora de Lima. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE_FORMAT.format(d);
}
