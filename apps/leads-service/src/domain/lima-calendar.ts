/**
 * Calendario de America/Lima. Perú no aplica horario de verano desde 1994, así
 * que la zona es UTC-5 fija y basta con un desfase constante (sin Intl ni
 * dependencias). Si algún día cambiara, este es el único punto a tocar.
 */
export const LIMA_UTC_OFFSET_HOURS = -5;
const OFFSET_MS = LIMA_UTC_OFFSET_HOURS * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha civil `YYYY-MM-DD` en Lima del instante dado. */
export function limaDateOf(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Año civil en Lima del instante dado. */
export function limaYearOf(instant: Date): number {
  return Number(limaDateOf(instant).slice(0, 4));
}

/** `true` si el texto es una fecha `YYYY-MM-DD` real (no 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Inicio (incluido) y fin (excluido) en UTC del día civil `date` de Lima. */
export function limaDayRange(date: string): { from: Date; to: Date } {
  if (!isIsoDate(date)) {
    throw new Error(`Fecha inválida: ${date}`);
  }
  const from = new Date(Date.parse(`${date}T00:00:00.000Z`) - OFFSET_MS);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

/** Día anterior (`YYYY-MM-DD`). */
export function previousIsoDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** Día de la semana (0 = domingo … 6 = sábado) de una fecha civil. */
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/**
 * Suma `days` días hábiles (lunes a viernes, excluyendo `holidays`) a un
 * instante, contando desde el día civil de Lima siguiente al de recepción.
 * Conserva la hora del día: el plazo vence a la misma hora del último día hábil.
 *
 * Ejemplo: recibido el viernes 2026-11-13 a las 10:00 (Lima), 15 días hábiles
 * → viernes 2026-12-04 a las 10:00 (sin feriados en medio).
 */
export function addBusinessDays(instant: Date, days: number, holidays: ReadonlySet<string>): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error('days debe ser un entero no negativo');
  }
  let cursor = limaDateOf(instant);
  let elapsedDays = 0;
  let counted = 0;
  while (counted < days) {
    cursor = new Date(Date.parse(`${cursor}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
    elapsedDays += 1;
    const weekday = weekdayOf(cursor);
    if (weekday !== 0 && weekday !== 6 && !holidays.has(cursor)) {
      counted += 1;
    }
  }
  return new Date(instant.getTime() + elapsedDays * DAY_MS);
}

/**
 * Milisegundos desde `now` hasta la próxima vez que en Lima sean las `hour`:00.
 * Si ya pasó hoy, apunta a mañana. Nunca devuelve 0 (mínimo 1 s).
 */
export function msUntilNextLimaHour(now: Date, hour: number): number {
  const today = limaDateOf(now);
  let target = limaDayRange(today).from.getTime() + hour * 60 * 60 * 1000;
  if (target <= now.getTime() + 1000) {
    target += DAY_MS;
  }
  return target - now.getTime();
}
