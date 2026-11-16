/** Formatos de fecha en español de Perú, siempre en la zona horaria de Lima. */

const LIMA = 'America/Lima';

/** «30 de noviembre de 2026» */
export function formatLongDate(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00-05:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: LIMA }).format(date);
}

/** «30 de noviembre» (sin año, para vigencias cortas). */
export function formatDayMonth(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', timeZone: LIMA }).format(date);
}

/** Importe en soles a partir de céntimos: 24900 → «S/ 249.00». */
export function formatSoles(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}
