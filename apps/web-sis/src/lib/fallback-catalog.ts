import type { Promotion, Specialty } from '@capsur/api-contracts';

/**
 * Catálogo de respaldo. Se usa SOLO cuando promotions-service no responde,
 * para que la landing siga mostrando la oferta. El backend sigue siendo la
 * autoridad: al registrar la solicitud, leads-service vuelve a validar la
 * promoción contra el catálogo real. Mantener alineado con prisma/seed.ts
 * de promotions-service.
 */
const VALID_FROM = '2026-11-01T00:00:00.000Z';

export const fallbackPromotions: Promotion[] = [
  {
    id: 'dos-por-uno',
    brand: 'sis',
    name: '2×1',
    headline: 'S/350',
    price: { amount: 35000, currency: 'PEN' },
    bundle: { specialtiesIncluded: 2, allowedTracks: ['ia', 'tradicional'], label: 'IA + tradicional' },
    featured: false,
    icon: 'gift',
    validFrom: VALID_FROM,
    validUntil: null,
    campaignId: 'especialidades-ia-2026-11',
    sortOrder: 1,
  },
  {
    id: 'con-ia',
    brand: 'sis',
    name: 'CON IA',
    headline: 'S/249',
    price: { amount: 24900, currency: 'PEN' },
    bundle: { specialtiesIncluded: 1, allowedTracks: ['ia'], label: '1 especialidad' },
    featured: true,
    icon: 'layers',
    validFrom: VALID_FROM,
    validUntil: null,
    campaignId: 'especialidades-ia-2026-11',
    sortOrder: 2,
  },
  {
    id: 'pack-ia-pro',
    brand: 'sis',
    name: 'PACK IA PRO',
    headline: 'S/499',
    price: { amount: 49900, currency: 'PEN' },
    bundle: { specialtiesIncluded: 2, allowedTracks: ['ia'], label: '2 especialidades IA' },
    featured: false,
    icon: 'stack',
    validFrom: VALID_FROM,
    validUntil: null,
    campaignId: 'especialidades-ia-2026-11',
    sortOrder: 3,
  },
];

export const fallbackSpecialties: Specialty[] = [
  {
    id: 'desarrollo-web-con-ia',
    brand: 'sis',
    name: 'Desarrollo Web con Inteligencia Artificial',
    shortName: 'Desarrollo Web con IA',
    track: 'ia',
    summary:
      'Transforma páginas estáticas en plataformas inteligentes: integra modelos de IA, procesamiento de lenguaje natural, visión por computadora y recomendación en tiempo real.',
    audience: ['Desarrolladores frontend y backend', 'Diseñadores UX/UI', 'Emprendedores de tecnología y líderes TI'],
    modality: '100% virtual',
    endorsedBy: 'Colegio de Ingenieros del Perú',
    sortOrder: 1,
  },
  {
    id: 'ciberseguridad-4-0',
    brand: 'sis',
    name: 'Ciberseguridad 4.0: Estrategia de Defensa con IA',
    shortName: 'Ciberseguridad 4.0',
    track: 'ia',
    summary:
      'Pasa de una seguridad reactiva a una defensa predictiva y automatizada frente a amenazas potenciadas por IA generativa.',
    audience: ['Líderes de TI y seguridad', 'Analistas SOC y threat hunters', 'Perfiles DevSecOps', 'Peritos forenses'],
    modality: '100% virtual',
    endorsedBy: 'Colegio de Ingenieros del Perú',
    sortOrder: 2,
  },
  {
    id: 'gestion-integral-bd-con-ia',
    brand: 'sis',
    name: 'Gestión Integral de Bases de Datos con IA',
    shortName: 'Bases de Datos con IA',
    track: 'ia',
    summary:
      'Diseño, administración y optimización de bases de datos apoyadas en herramientas de Inteligencia Artificial.',
    audience: ['Administradores de bases de datos', 'Analistas de datos', 'Desarrolladores backend'],
    modality: '100% virtual',
    endorsedBy: 'Colegio de Ingenieros del Perú',
    sortOrder: 3,
  },
  {
    id: 'redes-y-comunicaciones-nivel-avanzado',
    brand: 'sis',
    name: 'Redes y Comunicaciones Nivel Avanzado: Infraestructura de TI',
    shortName: 'Redes y Comunicaciones Avanzado',
    track: 'tradicional',
    summary:
      'Diseña, implementa y gestiona infraestructuras de TI seguras: virtualización, sistemas operativos, almacenamiento, monitoreo, cloud y automatización.',
    audience: ['Ingenieros y especialistas de TI', 'Administradores de conectividad', 'Técnicos senior', 'Líderes de operaciones'],
    modality: '100% virtual',
    endorsedBy: 'Colegio de Ingenieros del Perú',
    sortOrder: 4,
  },
  {
    id: 'administracion-de-redes-y-comunicacion-de-datos',
    brand: 'sis',
    name: 'Administración de Redes y Comunicación de Datos',
    shortName: 'Administración de Redes',
    track: 'tradicional',
    summary: 'Administración de redes corporativas, enrutamiento, seguridad perimetral y telecomunicaciones.',
    audience: ['Técnicos y administradores de red'],
    modality: '100% virtual',
    endorsedBy: 'Colegio de Ingenieros del Perú',
    sortOrder: 5,
  },
  {
    id: 'computacion-e-informatica',
    brand: 'sis',
    name: 'Carrera Técnica de Computación e Informática',
    shortName: 'Computación e Informática',
    track: 'tradicional',
    summary: 'Carrera técnica profesional de 3 años en desarrollo de software, redes y soporte.',
    audience: ['Egresados de secundaria', 'Personas que inician su formación técnica'],
    modality: '100% virtual',
    endorsedBy: 'Colegio de Ingenieros del Perú',
    sortOrder: 6,
  },
];
