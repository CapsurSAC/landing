/**
 * Próximos inicios de clase (A23). El bloque se oculta mientras la lista esté
 * vacía. Cargar solo fechas confirmadas por el área académica.
 */
export interface StartDate {
  /** Slug de la especialidad del catálogo (p. ej. «desarrollo-web-con-ia»). */
  specialtyId: string;
  /** Fecha de inicio en formato YYYY-MM-DD (hora de Perú). */
  date: string;
  /** Nota corta opcional (p. ej. «Inscripciones abiertas»). */
  note?: string;
}

export const startDates: StartDate[] = [];
