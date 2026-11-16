/**
 * Preguntas frecuentes (A11). Solo respuestas verificables con los brochures,
 * el catálogo o la web oficial; lo demás se deriva a un asesor.
 */
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const ADVISOR_ANSWER = 'Te lo confirma un asesor por WhatsApp.';

export const faqItems: FaqItem[] = [
  {
    id: 'modalidad',
    question: '¿Las especialidades son presenciales o virtuales?',
    answer:
      'Son 100% virtuales. Tienes acceso a la plataforma virtual las 24 horas, los 7 días de la semana, durante toda la especialidad.',
  },
  {
    id: 'certificacion',
    question: '¿Qué certificación recibo?',
    answer:
      'Recibes una certificación física y/o digital con código QR para su validación, con el respaldo del Colegio de Ingenieros del Perú – Consejo Departamental de Tacna.',
  },
  {
    id: 'soporte',
    question: '¿Tendré acompañamiento mientras estudio?',
    answer: 'Sí. Cuentas con soporte académico de lunes a viernes, sin costo adicional.',
  },
  {
    id: 'duracion',
    question: '¿Cuánto dura cada especialidad?',
    answer: `Depende de la especialidad: Desarrollo Web con IA dura 4 meses (250 horas académicas), Ciberseguridad 4.0 dura 2 meses (120 horas académicas) y Redes y Comunicaciones Nivel Avanzado dura 4 meses (400 horas académicas). Para las demás, ${ADVISOR_ANSWER.charAt(0).toLowerCase()}${ADVISOR_ANSWER.slice(1)}`,
  },
  {
    id: 'promociones',
    question: '¿Qué incluye cada promoción?',
    answer:
      'Cada promoción indica cuántas especialidades incluye y de qué tipo (con IA o tradicional). Puedes verlo en el comparador de promociones de esta página y elegir tus especialidades en el formulario o decidirlas con un asesor.',
  },
  { id: 'inicio', question: '¿Cuándo empiezan las clases?', answer: ADVISOR_ANSWER },
  { id: 'pagos', question: '¿Cuáles son las formas de pago?', answer: ADVISOR_ANSWER },
  {
    id: 'catalogo',
    question: '¿Cómo recibo el catálogo?',
    answer:
      'Elige tu promoción y completa el formulario. Registramos tu solicitud con un código y te llevamos a WhatsApp, donde un asesor te envía el catálogo.',
  },
  {
    id: 'sede',
    question: '¿Dónde están ubicados?',
    answer: 'Nuestra sede está en Calle Deustua 270, Tacna. Central telefónica: 052-350006.',
  },
];
