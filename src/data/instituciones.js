/**
 * Contenido estático de la sección de instituciones.
 *
 * `descripcion` va en el frente de la tarjeta, bajo el logo. El resto se lee
 * al voltearla: `tipo` (qué es), `ofrece` (qué se estudia ahí, de 3 a 5 líneas
 * cortas) y `modalidad`. Todo sale de la web oficial de cada institución:
 * antes de cambiarlo, confírmalo con ella.
 */
export const INSTITUCIONES = [
  {
    nombre: 'Sistemas del Sur',
    descripcion: 'Formación técnica y convalidación',
    archivo: 'sistemas-del-sur.webp',
    tipo: 'Instituto superior tecnológico',
    ofrece: [
      'Computación e Informática, carrera de 3 años',
      'Inteligencia artificial y ciberseguridad',
      'Power BI y redes Cisco CCNA',
    ],
    modalidad: 'Formación virtual',
  },
  {
    nombre: 'Sistemas del Sur Perú',
    descripcion: 'Formación técnica enfocada en empleabilidad',
    archivo: 'sistemas-del-sur-peru.webp',
    tipo: 'Instituto de educación superior',
    ofrece: ['Desarrollo de Sistemas de Información', 'Gestión Administrativa', 'Contabilidad'],
    modalidad: 'Aula virtual 24/7',
  },
  {
    nombre: 'Avanti',
    descripcion: 'Carreras técnicas y formación ocupacional',
    archivo: 'avanti.webp',
    tipo: 'Instituto superior tecnológico',
    ofrece: [
      'Guía Oficial de Turismo',
      'Administración de Servicios de Hostelería',
      'Cosmetología',
    ],
    modalidad: 'A distancia',
  },
  {
    nombre: 'Cecava',
    descripcion: 'Capacitación y especialización profesional',
    archivo: 'cecava.webp',
    tipo: 'Diplomados y cursos en línea',
    ofrece: [
      'Minería',
      'SSOMA y medio ambiente',
      'Sistemas ISO',
      'Comercio exterior',
      'Administración y derecho',
    ],
    modalidad: '100 % virtual',
  },
  {
    nombre: 'Matpel',
    descripcion: 'Minería, seguridad y gestión de riesgos',
    archivo: 'matpel.webp',
    tipo: 'Certificación en materiales peligrosos',
    ofrece: [
      'Nivel I: reconocer e identificar',
      'Nivel II: respuesta defensiva',
      'Nivel III: respuesta ofensiva y comando',
    ],
    modalidad: '100 % virtual',
  },
  {
    nombre: 'Magíster Capacítate',
    descripcion: 'Programas de especialización y diplomados',
    archivo: 'magister.webp',
    tipo: 'Capacitación para docentes',
    ofrece: [
      'Diplomados de IA educativa',
      'Diplomados de la Ley 31900',
      'Curso de nombramiento docente',
    ],
    modalidad: '100 % virtual',
  },
  {
    nombre: 'Globalex',
    descripcion: 'Programas de estudio de alta especialización',
    archivo: 'globalex.webp',
    tipo: 'Instituto de educación superior',
    ofrece: [
      'Administración de Negocios Internacionales',
      'Desarrollo de Soluciones de TI',
      'Marketing',
    ],
    modalidad: 'Aula virtual',
  },
];

/** Carpeta pública donde viven los logos, dentro de public_html. */
export const RUTA_LOGOS = '/logos';
