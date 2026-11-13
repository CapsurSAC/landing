/**
 * Sección "Programas por institución": el detalle de la oferta de cada marca.
 *
 * Todo el texto sale del PDF que entregó CAPSUR ("Texto del párrafo.pdf",
 * 13/11/2026). Antes de añadir o cambiar algo, confírmalo con ellos.
 *
 * - `logo` es un archivo de public/logos y `foto` uno de public/programas.
 * - En `puntos`, `proximamente: true` muestra la etiqueta "Próximamente".
 * - `categorias` dice en qué enlaces de la cabecera aparece (ver CATEGORIAS).
 * - `area` es el value de AREAS (src/data/opciones.js) que se marca en el
 *   formulario al tocar "Me interesa". Va vacío cuando el programa no encaja
 *   en una sola área: entonces la persona la elige en el formulario.
 */

/**
 * Los cuatro enlaces de la cabecera. Cada uno abre /programas/<id> con los
 * programas de esa categoría. `descripcion` va a Google y a las vistas previas.
 */
export const CATEGORIAS = [
  {
    id: 'formacion-tecnica',
    nombre: 'Formación Técnica',
    descripcion:
      'Carreras profesionales técnicas de Sistemas del Sur, Avanti y Globalex: computación, turismo, hostelería y carreras 100 % online.',
  },
  {
    id: 'especializacion',
    nombre: 'Especialización',
    descripcion:
      'Diplomados y programas de especialización en minería, educación, tecnología, turismo y negocios de las instituciones de CAPSUR.',
  },
  {
    id: 'capacitacion',
    nombre: 'Capacitación',
    descripcion:
      'Capacitación para el trabajo: minería, SSOMA, materiales peligrosos, formación docente e idiomas online.',
  },
  {
    id: 'convalidacion',
    nombre: 'Convalidación',
    descripcion:
      'Continuidad de estudios y convalidación (sujeta a evaluación) en la carrera de Computación e Informática.',
  },
];

/** Dirección de la página de programas, filtrada si se pasa una categoría. */
export const urlProgramas = (categoria) => (categoria ? `/programas/${categoria}` : '/programas');

export const PROGRAMAS = [
  {
    id: 'sistemas-del-sur',
    categorias: ['formacion-tecnica', 'especializacion', 'convalidacion'],
    institucion: 'Sistemas del Sur',
    logo: 'sistemas-del-sur.webp',
    foto: 'computacion.webp',
    titulo: 'Carrera Profesional Técnica de Computación e Informática',
    descripcion: 'Forma tu carrera técnica y da el siguiente paso hacia tu titulación profesional.',
    puntos: [
      { texto: 'Continuidad de estudios y/o convalidación (sujeta a evaluación)' },
      {
        texto:
          'Formación continua: especialidades y cursos de inteligencia artificial, programación, base de datos, ciberseguridad, automatización, administración de redes, tecnologías de la información y más',
      },
    ],
    area: 'computacion',
  },
  {
    id: 'avanti',
    categorias: ['formacion-tecnica', 'especializacion'],
    institucion: 'Avanti',
    logo: 'avanti.webp',
    foto: 'turismo.webp',
    titulo: 'Turismo y Hotelería',
    descripcion:
      'Desarrolla tu talento en el sector turístico y de la hospitalidad, con programas orientados al mercado laboral.',
    puntos: [
      { texto: 'Guía Oficial de Turismo' },
      { texto: 'Administración de Servicios de Hostelería' },
      {
        texto: 'Formación continua: diplomados y cursos de turismo, hostelería, gastronomía y más',
      },
    ],
    area: 'turismo-hosteleria',
  },
  {
    id: 'cecava',
    categorias: ['especializacion', 'capacitacion'],
    institucion: 'Cecava',
    logo: 'cecava.webp',
    foto: 'mineria.webp',
    titulo: 'Capacitación Especializada',
    descripcion:
      'Fortalece tus competencias para el sector minero e industrial con programas de alta demanda.',
    puntos: [
      { texto: 'Diplomados en minería' },
      { texto: 'Seguridad y prevención' },
      { texto: 'SSOMA' },
      { texto: 'Gestión en operaciones' },
    ],
    area: 'mineria-seguridad',
  },
  {
    id: 'matpel',
    categorias: ['capacitacion'],
    institucion: 'Matpel',
    logo: 'matpel.webp',
    foto: 'materiales-peligrosos.webp',
    sello: 'Autorizados con R.D. 0573-2023-MTC/17.03',
    titulo: 'Materiales Peligrosos',
    descripcion:
      'Capacítate en la gestión segura de materiales y residuos peligrosos, cumpliendo con la normativa vigente.',
    puntos: [
      { texto: 'Manejo de Materiales Peligrosos' },
      { texto: 'Transporte y Almacenamiento' },
      { texto: 'Seguridad y respuesta ante emergencias' },
    ],
    area: 'mineria-seguridad',
  },
  {
    id: 'magister',
    categorias: ['especializacion', 'capacitacion'],
    institucion: 'Magíster Capacítate',
    logo: 'magister.webp',
    foto: 'docentes.webp',
    titulo: 'Formación Docente',
    descripcion:
      'Actualiza tus conocimientos y potencia tu labor educativa con diplomados y programas de especialización.',
    puntos: [
      { texto: 'Diplomados en educación' },
      { texto: 'Programas de especialización' },
      { texto: 'Actualización docente' },
    ],
    area: 'educacion',
  },
  {
    id: 'next-online',
    categorias: ['capacitacion'],
    institucion: 'Next Online',
    logo: 'next-online.webp',
    foto: 'idiomas.webp',
    titulo: 'Idiomas Online',
    descripcion:
      'Programas de aprendizaje de idiomas para tu desarrollo personal y profesional, 100 % virtual.',
    puntos: [
      { texto: 'Inglés' },
      { texto: 'Portugués' },
      { texto: 'Quechua' },
      { texto: 'Aymara' },
      { texto: 'Italiano' },
      { texto: 'Francés' },
    ],
    enColumnas: true,
    area: '',
  },
  {
    id: 'sistemas-del-sur-peru',
    categorias: ['formacion-tecnica'],
    institucion: 'Sistemas del Sur Perú',
    logo: 'sistemas-del-sur-peru.webp',
    foto: 'carreras-online.webp',
    titulo: 'Carreras 100 % online',
    descripcion: 'Nuevas carreras profesionales técnicas para estudiar desde donde estés.',
    puntos: [
      { texto: 'Carrera Profesional Técnica de Gestión Administrativa', proximamente: true },
      { texto: 'Carrera Profesional Técnica de Contabilidad', proximamente: true },
      {
        texto:
          'Carrera Profesional Técnica de Desarrollo de Soluciones Tecnológicas de la Información',
        proximamente: true,
      },
    ],
    area: '',
  },
  {
    id: 'globalex',
    categorias: ['formacion-tecnica', 'especializacion'],
    institucion: 'Globalex',
    logo: 'globalex.webp',
    foto: 'negocios.webp',
    titulo: 'Negocios, Marketing y Tecnología',
    descripcion:
      'Formación continua: fortalece tus competencias profesionales en negocios, marketing y tecnología con formación especializada.',
    puntos: [
      {
        texto: 'Carrera Profesional Técnica de Administración de Negocios Internacionales',
        proximamente: true,
      },
      { texto: 'Carrera Profesional Técnica de Marketing Digital', proximamente: true },
      {
        texto: 'Carrera Profesional Técnica de Desarrollo de Sistemas de Información',
        proximamente: true,
      },
    ],
    area: '',
  },
];

/** Carpeta pública de las fotos de cada programa. */
export const RUTA_FOTOS = '/fotos-programas';
