/**
 * Semilla idempotente del catálogo de IEST Privado Sistemas del Sur (SIS).
 * Se ejecuta con `pnpm --filter @capsur/promotions-service db:seed` (tsx).
 * Todas las escrituras son upserts: puede correrse tantas veces como haga falta.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Prisma, PrismaClient } from './generated/client';

// tsx no carga .env por sí solo; Prisma necesita DATABASE_URL en process.env.
if (!process.env.DATABASE_URL) {
  const envPath = join(__dirname, '..', '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const prisma = new PrismaClient();

const BRAND_ID = 'sis';
const CAMPAIGN_ID = 'especialidades-ia-2026-11';
const CAMPAIGN_START = new Date('2026-11-01T00:00:00.000Z');
const MODALITY = '100% virtual';
const ENDORSED_BY = 'Colegio de Ingenieros del Perú';

type SpecialtySeed = Omit<Prisma.SpecialtyUncheckedCreateInput, 'brandId'>;
type PromotionSeed = Omit<Prisma.PromotionUncheckedCreateInput, 'brandId' | 'campaignId'>;

const specialties: SpecialtySeed[] = [
  {
    id: 'desarrollo-web-con-ia',
    name: 'Desarrollo Web con Inteligencia Artificial',
    track: 'IA',
    summary:
      'Transforma páginas estáticas en plataformas inteligentes integrando modelos de IA, ' +
      'procesamiento de lenguaje natural, visión por computadora y recomendación en tiempo real.',
    audience: [
      'Desarrolladores frontend y backend',
      'Diseñadores UX/UI y maquetadores',
      'Emprendedores de tecnología y líderes TI',
    ],
    modality: MODALITY,
    endorsedBy: ENDORSED_BY,
    sortOrder: 1,
  },
  {
    id: 'ciberseguridad-4-0',
    name: 'Ciberseguridad 4.0: Estrategia de Defensa con IA',
    track: 'IA',
    summary:
      'Pasa de una seguridad reactiva a una defensa predictiva y automatizada frente a amenazas ' +
      'potenciadas por IA generativa.',
    audience: [
      'Líderes de TI y seguridad (CISO, CIO, CTO)',
      'Analistas SOC, threat hunters e ingenieros de ciberseguridad',
      'Perfiles DevSecOps',
      'Peritos forenses y analistas de fraude digital',
    ],
    modality: MODALITY,
    endorsedBy: ENDORSED_BY,
    sortOrder: 2,
  },
  {
    id: 'gestion-integral-bd-con-ia',
    name: 'Gestión Integral de Bases de Datos con IA',
    track: 'IA',
    summary:
      'Diseño, administración y optimización de bases de datos apoyadas en herramientas de IA.',
    audience: ['Administradores de bases de datos', 'Analistas de datos', 'Desarrolladores backend'],
    modality: MODALITY,
    endorsedBy: ENDORSED_BY,
    sortOrder: 3,
  },
  {
    id: 'redes-y-comunicaciones-nivel-avanzado',
    name: 'Redes y Comunicaciones Nivel Avanzado: Infraestructura de TI',
    track: 'TRADICIONAL',
    summary:
      'Diseñar, implementar y gestionar infraestructuras de TI seguras: virtualización, sistemas ' +
      'operativos, almacenamiento, seguridad, monitoreo, cloud y automatización.',
    audience: [
      'Ingenieros y especialistas de TI',
      'Administradores de conectividad',
      'Técnicos senior',
      'Líderes de operaciones',
    ],
    modality: MODALITY,
    endorsedBy: ENDORSED_BY,
    sortOrder: 4,
  },
  {
    id: 'administracion-de-redes-y-comunicacion-de-datos',
    name: 'Administración de Redes y Comunicación de Datos',
    track: 'TRADICIONAL',
    summary:
      'Administración de redes corporativas, enrutamiento, seguridad perimetral y telecomunicaciones.',
    audience: ['Técnicos y administradores de red'],
    modality: MODALITY,
    endorsedBy: ENDORSED_BY,
    sortOrder: 5,
  },
  {
    id: 'computacion-e-informatica',
    name: 'Carrera Técnica de Computación e Informática',
    shortName: 'Computación e Informática',
    track: 'TRADICIONAL',
    summary:
      'Carrera técnica profesional de 3 años en desarrollo de software, redes y soporte.',
    audience: ['Egresados de secundaria', 'Personas que inician su formación técnica'],
    modality: MODALITY,
    endorsedBy: ENDORSED_BY,
    sortOrder: 6,
  },
];

const promotions: PromotionSeed[] = [
  {
    id: 'dos-por-uno',
    name: '2×1',
    headline: 'S/350',
    priceAmount: 35000,
    currency: 'PEN',
    specialtiesIncluded: 2,
    allowedTracks: ['IA', 'TRADICIONAL'],
    bundleLabel: 'IA + tradicional',
    featured: false,
    icon: 'GIFT',
    validFrom: CAMPAIGN_START,
    validUntil: null,
    sortOrder: 1,
  },
  {
    id: 'con-ia',
    name: 'CON IA',
    headline: 'S/249',
    priceAmount: 24900,
    currency: 'PEN',
    specialtiesIncluded: 1,
    allowedTracks: ['IA'],
    bundleLabel: '1 especialidad',
    featured: true,
    icon: 'LAYERS',
    validFrom: CAMPAIGN_START,
    validUntil: null,
    sortOrder: 2,
  },
  {
    id: 'pack-ia-pro',
    name: 'PACK IA PRO',
    headline: 'S/499',
    priceAmount: 49900,
    currency: 'PEN',
    specialtiesIncluded: 2,
    allowedTracks: ['IA'],
    bundleLabel: '2 especialidades IA',
    featured: false,
    icon: 'STACK',
    validFrom: CAMPAIGN_START,
    validUntil: null,
    sortOrder: 3,
  },
];

async function main(): Promise<void> {
  await prisma.brand.upsert({
    where: { id: BRAND_ID },
    create: {
      id: BRAND_ID,
      name: 'Sistemas del Sur',
      displayName: 'IEST Privado Sistemas del Sur',
      active: true,
    },
    update: { name: 'Sistemas del Sur', displayName: 'IEST Privado Sistemas del Sur', active: true },
  });

  await prisma.campaign.upsert({
    where: { id: CAMPAIGN_ID },
    create: {
      id: CAMPAIGN_ID,
      brandId: BRAND_ID,
      name: 'Especialidades con IA',
      utmCampaign: 'especialidades-ia',
      startsAt: CAMPAIGN_START,
      endsAt: null,
      active: true,
    },
    update: {
      name: 'Especialidades con IA',
      utmCampaign: 'especialidades-ia',
      startsAt: CAMPAIGN_START,
      endsAt: null,
      active: true,
    },
  });

  for (const specialty of specialties) {
    const { id, ...data } = specialty;
    await prisma.specialty.upsert({
      where: { id },
      create: { id, brandId: BRAND_ID, ...data },
      update: { ...data, active: true },
    });
  }

  for (const promotion of promotions) {
    const { id, ...data } = promotion;
    await prisma.promotion.upsert({
      where: { id },
      create: { id, brandId: BRAND_ID, campaignId: CAMPAIGN_ID, ...data },
      update: { ...data, campaignId: CAMPAIGN_ID, active: true },
    });
  }

  const [brands, campaigns, specialtyCount, promotionCount] = await Promise.all([
    prisma.brand.count(),
    prisma.campaign.count(),
    prisma.specialty.count(),
    prisma.promotion.count(),
  ]);
  console.warn(
    `Semilla aplicada: ${brands} marca(s), ${campaigns} campaña(s), ` +
      `${specialtyCount} especialidad(es), ${promotionCount} promoción(es).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('La semilla falló:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
