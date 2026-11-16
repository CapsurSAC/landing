/**
 * Contenido editorial de las páginas /especialidades/[slug].
 *
 * Fuente: brochures oficiales de ISTP SIS (texto extraído de los PDF y
 * reconstruido). Solo se incluye lo que figura en el brochure; lo que falta
 * (docentes, fechas, precios por especialidad) NO se completa aquí: la página
 * ofrece confirmarlo con un asesor. Las especialidades sin brochure usan solo
 * los datos del catálogo (promotions-service o catálogo de respaldo).
 *
 * Pendiente con el cliente: brochures de «Gestión Integral de Bases de Datos
 * con IA», «Administración de Redes y Comunicación de Datos» y «Carrera de
 * Computación e Informática» (los archivos recibidos están vacíos) y el final
 * del temario de Ciberseguridad 4.0 y Redes y Comunicaciones (texto truncado).
 */

export interface AudienceProfile {
  title: string;
  description: string;
}

export interface SyllabusModule {
  title: string;
  topics: string[];
}

export interface SpecialtyContent {
  /** Presentación tal como aparece en el brochure. */
  presentation: string;
  /** Público objetivo detallado («Dirigido a»). */
  audience: AudienceProfile[];
  /** Duración y carga académica del certificado. */
  facts: { months: number; credits: number; academicHours: number };
  syllabus: SyllabusModule[];
  /** true si el texto del brochure llegó truncado y el temario no está completo. */
  syllabusPartial: boolean;
}

/** Beneficios comunes que figuran en todos los brochures recibidos. */
export const BROCHURE_BENEFITS = [
  'Modalidad 100% virtual.',
  'Acceso a la plataforma virtual 24/7 durante toda la especialidad.',
  'Contenido elaborado por docentes con apoyo de la Inteligencia Artificial.',
  'Soporte académico de lunes a viernes, sin costo adicional.',
  'Certificación física y/o digital con código QR para validación.',
] as const;

export const CERTIFICATE_ENDORSEMENT = 'Validado por el Colegio de Ingenieros del Perú – Consejo Departamental de Tacna.';

export const specialtyContent: Record<string, SpecialtyContent> = {
  'desarrollo-web-con-ia': {
    presentation:
      'Transforma páginas estáticas en plataformas inteligentes. Este programa fusiona el desarrollo full-stack tradicional (frontend y backend) con la integración de modelos de IA, enseñándote a consumir APIs de procesamiento de lenguaje natural (NLP), visión por computadora y sistemas de recomendación en tiempo real.',
    audience: [
      {
        title: 'Desarrolladores frontend y backend',
        description: 'Profesionales que buscan actualizarse en la integración y consumo de modelos de IA en plataformas de producción.',
      },
      {
        title: 'Diseñadores UX/UI y maquetadores',
        description: 'Interesados en comprender cómo la IA personaliza layouts e interfaces dinámicamente según el comportamiento del usuario.',
      },
      {
        title: 'Emprendedores de tecnología y líderes TI',
        description: 'Perfiles que necesitan orquestar arquitecturas de software modernas e implementar MVPs escalables e inteligentes.',
      },
    ],
    facts: { months: 4, credits: 15, academicHours: 250 },
    syllabus: [
      {
        title: 'Fundamentos de la Web',
        topics: [
          'HTML, CSS y JavaScript esenciales',
          'Principios de diseño web responsivo',
          'Arquitectura cliente-servidor',
          'Frameworks y bibliotecas frontend',
        ],
      },
      {
        title: 'Desarrollo Backend y Bases de Datos',
        topics: ['Node.js y Django', 'APIs RESTful y autenticación', 'Bases de datos relacionales y NoSQL', 'Modelado de datos para aplicaciones'],
      },
      {
        title: 'Introducción a la Inteligencia Artificial',
        topics: ['Conceptos básicos de IA', 'Tipos de algoritmos de IA', 'Aplicaciones de IA en web', 'Gestión de estado en aplicaciones'],
      },
      {
        title: 'Implementación de IA en Desarrollo Web',
        topics: [
          'Integración de modelos de IA',
          'APIs de NLP y visión por computadora',
          'Personalización y recomendación con IA',
          'Interfaces de usuario interactivas',
        ],
      },
      {
        title: 'Ética, Privacidad y Despliegue',
        topics: [
          'Ética en el desarrollo con IA',
          'Privacidad y protección de datos',
          'Desarrollo de PWA y pruebas',
          'Despliegue y gestión de aplicaciones',
        ],
      },
    ],
    syllabusPartial: false,
  },
  'ciberseguridad-4-0': {
    presentation:
      'El avance de la IA generativa ha transformado el mapa de amenazas corporativas. Este programa especializado te capacita para liderar la transición de una seguridad reactiva a una defensa predictiva y automatizada, protegiendo a tu organización de los ciberataques del futuro.',
    audience: [
      { title: 'Líderes de TI y seguridad', description: 'CISOs, CIOs, CTOs y gerentes de tecnología.' },
      { title: 'Especialistas en defensa', description: 'Analistas de SOC, threat hunters e ingenieros de ciberseguridad.' },
      { title: 'Desarrolladores y arquitectos', description: 'Profesionales enfocados en DevSecOps y seguridad en IA.' },
      { title: 'Investigadores', description: 'Peritos forenses y analistas de fraude digital.' },
    ],
    facts: { months: 2, credits: 8, academicHours: 120 },
    syllabus: [
      {
        title: 'Fundamentos de la Ciberseguridad 4.0 y el Paradigma de la IA',
        topics: [
          'Evolución estratégica y defensa predictiva',
          'El nuevo panorama de amenazas y la IA generativa',
          'Gobernanza, ética y cumplimiento regulatorio',
        ],
      },
      {
        title: 'Vulnerabilidades Conceptuales y Seguridad de la IA (Adversarial ML)',
        topics: [
          'Taxonomía de ataques a modelos de IA y data poisoning',
          'Riesgos en modelos de lenguaje (LLMs) y prompt injection',
          'Criptografía post-cuántica (PQC) y futuro de la confidencialidad',
        ],
      },
      {
        title: 'Arquitectura de Ciberinteligencia y Estrategia Ofensiva',
        topics: [
          'Modelado de amenazas avanzado con MITRE ATT&CK',
          'Fundamentos de threat hunting predictivo y UEBA',
          'Filosofía DevSecOps y automatización del desarrollo seguro',
        ],
      },
      {
        title: 'El Factor Humano Aumentado y la Amenaza de la Identidad Sintética',
        topics: ['Psicología de la ingeniería social 4.0 y phishing automatizado', 'Teoría de las redes generativas (GANs) y deepfakes'],
      },
    ],
    syllabusPartial: true,
  },
  'redes-y-comunicaciones-nivel-avanzado': {
    presentation:
      'La especialidad en Redes y Comunicación de Infraestructura de Tecnología de la Información enseña a diseñar, implementar y gestionar infraestructuras de TI seguras y eficientes, cubriendo fundamentos de TI, virtualización, sistemas operativos, almacenamiento, seguridad, monitoreo, cloud computing y automatización.',
    audience: [
      { title: 'Ingenieros y especialistas de TI', description: 'Diseño y gestión de arquitecturas complejas de red.' },
      { title: 'Administradores de conectividad', description: 'Optimización de enrutamiento avanzado y seguridad.' },
      { title: 'Técnicos senior', description: 'Gestión avanzada de servidores y telecomunicaciones.' },
      { title: 'Líderes de operaciones', description: 'Alta disponibilidad y continuidad de la infraestructura.' },
    ],
    facts: { months: 4, credits: 36, academicHours: 400 },
    syllabus: [
      {
        title: 'Fundamentos de Infraestructura de TI',
        topics: ['Introducción a la infraestructura de TI', 'Principios básicos de redes', 'Arquitecturas de hardware y software'],
      },
      {
        title: 'Virtualización',
        topics: ['Fundamentos de virtualización', 'Tipos de virtualización', 'Implementación de máquinas virtuales'],
      },
      {
        title: 'Administración de Sistemas Operativos',
        topics: ['Instalación y configuración de sistemas operativos', 'Administración de usuarios y grupos', 'Gestión de recursos y servicios'],
      },
      {
        title: 'Almacenamiento y Respaldo de Datos',
        topics: [
          'Tipos de almacenamiento',
          'Configuración y gestión de almacenamiento en red',
          'Estrategias de respaldo y recuperación de datos',
        ],
      },
      {
        title: 'Seguridad de la Infraestructura',
        topics: [
          'Principios de seguridad de la información',
          'Amenazas y vulnerabilidades en la infraestructura',
          'Implementación de controles de seguridad',
        ],
      },
      {
        title: 'Monitoreo y Optimización',
        topics: ['Herramientas de monitoreo de sistemas', 'Optimización de recursos de infraestructura', 'Planificación de capacidad'],
      },
      { title: 'Cloud Computing', topics: [] },
    ],
    syllabusPartial: true,
  },
};
