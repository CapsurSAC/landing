/**
 * Contenido opcional de la landing. Cada bloque se muestra SOLO si tiene
 * datos: vacío, la página queda como está. Todo lo que pongas aquí debe estar
 * confirmado por CAPSUR (nada de cifras, testimonios ni plazos inventados).
 */

/**
 * Preguntas frecuentes (sección bajo "¿Por qué formarte con CAPSUR?").
 * También salen en Google como resultado enriquecido (FAQPage).
 * @type {{ pregunta: string, respuesta: string }[]}
 * Ejemplo: { pregunta: '¿Puedo convalidar cursos de otro instituto?', respuesta: 'Sí, …' }
 */
export const PREGUNTAS = [];

/**
 * Testimonios de egresados, con su permiso por escrito.
 * `foto` es un archivo de public/testimonios/ (opcional).
 * @type {{ nombre: string, programa: string, texto: string, foto?: string }[]}
 */
export const TESTIMONIOS = [];

/**
 * Horario de atención de los asesores, en hora de Lima. null = no se muestra.
 * `dias`: 0 = domingo … 6 = sábado. Ejemplo:
 *   { dias: [1, 2, 3, 4, 5, 6], desde: '09:00', hasta: '18:00', texto: 'Lunes a sábado, de 9:00 a 18:00' }
 * @type {{ dias: number[], desde: string, hasta: string, texto: string } | null}
 */
export const HORARIO = null;

/**
 * Prueba A/B del titular de la portada. Con dos o más variantes, cada visitante
 * ve siempre la misma (se guarda en su navegador) y el panel de métricas
 * compara cuántos leads trae cada una. Vacío = el titular de siempre.
 * @type {{ id: string, linea1: string, linea2: string }[]}
 * Ejemplo: [{ id: 'a', linea1: '¿Cuál es tu próximo', linea2: 'paso profesional?' },
 *           { id: 'b', linea1: 'Da el siguiente', linea2: 'paso en tu carrera' }]
 */
export const VARIANTES_TITULAR = [];

/** Enlace para agendar una llamada (Calendly, Google Calendar…). Vacío = sin botón. */
export const URL_AGENDA = import.meta.env.VITE_URL_AGENDA || '';
