/**
 * Testimonios de egresados (A12). La sección de testimonios se oculta mientras
 * esta lista esté vacía. Solo se publican testimonios reales con autorización
 * escrita de la persona (nombre, foto opcional y texto aprobados).
 */
export interface Testimonial {
  /** Nombre como autorizó publicarlo (p. ej. «Ana Q.»). */
  name: string;
  /** Especialidad o carrera cursada, tal como figura en el catálogo. */
  program: string;
  /** Cita aprobada por la persona. */
  quote: string;
  /** Cargo o situación actual, si lo autorizó. */
  role?: string;
}

export const testimonials: Testimonial[] = [];
