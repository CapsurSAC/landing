import {
  type Brand as BrandRow,
  type Promotion as PromotionRowFull,
  type Specialty as SpecialtyRow,
  type PromotionIcon as PrismaPromotionIcon,
  type SpecialtyTrack as PrismaSpecialtyTrack,
} from '../../../prisma/generated/client';

/** Fila de promoción sin marcas de tiempo (consultas con `select` explícito, B12). */
type PromotionRow = Omit<PromotionRowFull, 'createdAt' | 'updatedAt'>;
import { Brand, Promotion, type PromotionIcon, Specialty, type SpecialtyTrack } from '../../domain';

/** Enums de Prisma (mayúsculas) a vocabulario del dominio/contrato (minúsculas). */
const TRACK_FROM_PRISMA: Record<PrismaSpecialtyTrack, SpecialtyTrack> = {
  IA: 'ia',
  TRADICIONAL: 'tradicional',
};

const TRACK_TO_PRISMA: Record<SpecialtyTrack, PrismaSpecialtyTrack> = {
  ia: 'IA',
  tradicional: 'TRADICIONAL',
};

const ICON_FROM_PRISMA: Record<PrismaPromotionIcon, PromotionIcon> = {
  GIFT: 'gift',
  LAYERS: 'layers',
  STACK: 'stack',
};

export function trackFromPrisma(track: PrismaSpecialtyTrack): SpecialtyTrack {
  return TRACK_FROM_PRISMA[track];
}

export function trackToPrisma(track: SpecialtyTrack): PrismaSpecialtyTrack {
  return TRACK_TO_PRISMA[track];
}

const ICON_TO_PRISMA: Record<PromotionIcon, PrismaPromotionIcon> = {
  gift: 'GIFT',
  layers: 'LAYERS',
  stack: 'STACK',
};

export function iconFromPrisma(icon: PrismaPromotionIcon): PromotionIcon {
  return ICON_FROM_PRISMA[icon];
}

export function iconToPrisma(icon: PromotionIcon): PrismaPromotionIcon {
  return ICON_TO_PRISMA[icon];
}

export function toBrand(row: BrandRow): Brand {
  return new Brand({
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    active: row.active,
  });
}

export function toSpecialty(row: SpecialtyRow): Specialty {
  return new Specialty({
    id: row.id,
    brandId: row.brandId,
    name: row.name,
    shortName: row.shortName,
    track: trackFromPrisma(row.track),
    summary: row.summary,
    audience: row.audience,
    modality: row.modality,
    endorsedBy: row.endorsedBy,
    sortOrder: row.sortOrder,
    active: row.active,
  });
}

export function toPromotion(row: PromotionRow): Promotion {
  return new Promotion({
    id: row.id,
    brandId: row.brandId,
    name: row.name,
    headline: row.headline,
    price: { amount: row.priceAmount, currency: row.currency },
    listPrice:
      row.listPriceAmount === null ? null : { amount: row.listPriceAmount, currency: row.currency },
    bundle: {
      specialtiesIncluded: row.specialtiesIncluded,
      allowedTracks: row.allowedTracks.map(trackFromPrisma),
      label: row.bundleLabel,
    },
    featured: row.featured,
    icon: iconFromPrisma(row.icon),
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    campaignId: row.campaignId,
    sortOrder: row.sortOrder,
    active: row.active,
  });
}
