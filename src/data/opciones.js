/**
 * Opciones de los tres selects del formulario.
 *
 * ►► ESTE ES EL ARCHIVO QUE EDITAS para cambiar las preguntas.
 *    No hace falta tocar ningún componente.
 *
 * El `value` es lo que viaja en el correo; la `label` es lo que ve el usuario.
 * En las áreas, `codigo` va en la referencia de WhatsApp ("Ref: EM1-COMP") y es
 * lo que reconoce el flujo de Chatwoot: si lo cambias, cámbialo también allí.
 */

export const AREAS = [
  { value: 'mineria-seguridad', codigo: 'MIN', label: 'Minería, seguridad y gestión de riesgos' },
  { value: 'computacion', codigo: 'COMP', label: 'Computación e informática' },
  { value: 'administracion', codigo: 'ADM', label: 'Administración y negocios' },
  { value: 'marketing', codigo: 'MKT', label: 'Marketing' },
  { value: 'negocios-internacionales', codigo: 'NEG', label: 'Negocios internacionales' },
  { value: 'turismo-hosteleria', codigo: 'TUR', label: 'Turismo, hostelería y gastronomía' },
  { value: 'salud', codigo: 'SAL', label: 'Salud y primeros auxilios' },
  { value: 'educacion', codigo: 'EDU', label: 'Educación y docencia' },
  { value: 'industria', codigo: 'IND', label: 'Industria, mantenimiento y operaciones' },
  { value: 'otra', codigo: 'GEN', label: 'Otra área / aún no lo decido' },
];

export const OBJETIVOS = [
  { value: 'titulacion', label: 'Titularme o convalidar estudios que dejé a medias' },
  { value: 'especializacion', label: 'Llevar una especialización o diplomado' },
  { value: 'capacitacion', label: 'Capacitarme para conseguir trabajo' },
  { value: 'carrera-tecnica', label: 'Estudiar una carrera técnica completa' },
  { value: 'evaluando', label: 'Todavía lo estoy evaluando' },
];

export const INICIOS = [
  { value: 'inmediato', label: 'Lo antes posible' },
  { value: 'proximo-mes', label: 'El próximo mes' },
  { value: 'dos-tres-meses', label: 'En 2 o 3 meses' },
  { value: 'averiguando', label: 'Solo estoy averiguando' },
];

/** Página estática en public/politica-de-privacidad.html. Rellena los datos marcados con « » antes de publicar. */
export const URL_POLITICA = '/politica-de-privacidad.html';

/**
 * Versión del texto de consentimiento. Súbele el número cada vez que
 * cambies la redacción: el backend la guarda junto al registro, de modo
 * que siempre se sabe qué aceptó exactamente cada persona (Ley 29733).
 */
export const VERSION_CONSENTIMIENTO = '2026-11-v1';
