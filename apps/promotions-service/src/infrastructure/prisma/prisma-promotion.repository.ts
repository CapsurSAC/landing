import { type PromotionRecord, type PromotionRepository } from '../../application/ports';
import { CampaignNotFoundError, type Promotion, PromotionAlreadyExistsError, PromotionNotFoundError } from '../../domain';
import { Prisma } from '../../../prisma/generated/client';
import { iconToPrisma, toPromotion, trackToPrisma } from './prisma.mappers';
import { type PrismaService } from './prisma.service';

/** Columnas que necesita el dominio (B12): sin leer `created_at`/`updated_at` en el catálogo público. */
const PROMOTION_SELECT = {
  id: true,
  brandId: true,
  name: true,
  headline: true,
  priceAmount: true,
  currency: true,
  listPriceAmount: true,
  specialtiesIncluded: true,
  allowedTracks: true,
  bundleLabel: true,
  featured: true,
  icon: true,
  validFrom: true,
  validUntil: true,
  campaignId: true,
  sortOrder: true,
  active: true,
} satisfies Prisma.PromotionSelect;

const PROMOTION_RECORD_SELECT = {
  ...PROMOTION_SELECT,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PromotionSelect;

type PromotionRecordRow = Prisma.PromotionGetPayload<{ select: typeof PROMOTION_RECORD_SELECT }>;

function toRecord(row: PromotionRecordRow): PromotionRecord {
  return { promotion: toPromotion(row), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function writableData(promotion: Promotion) {
  return {
    name: promotion.name,
    headline: promotion.headline,
    priceAmount: promotion.price.amount,
    currency: promotion.price.currency,
    listPriceAmount: promotion.listPrice?.amount ?? null,
    specialtiesIncluded: promotion.bundle.specialtiesIncluded,
    allowedTracks: promotion.bundle.allowedTracks.map(trackToPrisma),
    bundleLabel: promotion.bundle.label,
    featured: promotion.featured,
    icon: iconToPrisma(promotion.icon),
    validFrom: promotion.validFrom,
    validUntil: promotion.validUntil,
    sortOrder: promotion.sortOrder,
    active: promotion.active,
  };
}

/** Traduce los errores conocidos de Prisma a errores de dominio. */
function translateWriteError(error: unknown, promotion: Promotion): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new PromotionAlreadyExistsError(promotion.id);
    if (error.code === 'P2003') throw new CampaignNotFoundError(promotion.campaignId ?? '');
    if (error.code === 'P2025') throw new PromotionNotFoundError(promotion.brandId, promotion.id);
  }
  throw error;
}

export class PrismaPromotionRepository implements PromotionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByBrand(brandId: string): Promise<Promotion[]> {
    const rows = await this.prisma.promotion.findMany({
      where: { brandId, active: true },
      select: PROMOTION_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toPromotion);
  }

  async findById(brandId: string, promotionId: string): Promise<Promotion | null> {
    const row = await this.prisma.promotion.findFirst({
      where: { id: promotionId, brandId },
      select: PROMOTION_SELECT,
    });
    return row ? toPromotion(row) : null;
  }

  async listByBrand(brandId: string): Promise<PromotionRecord[]> {
    const rows = await this.prisma.promotion.findMany({
      where: { brandId },
      select: PROMOTION_RECORD_SELECT,
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async create(promotion: Promotion): Promise<PromotionRecord> {
    try {
      const row = await this.prisma.promotion.create({
        data: {
          id: promotion.id,
          ...writableData(promotion),
          brand: { connect: { id: promotion.brandId } },
          ...(promotion.campaignId ? { campaign: { connect: { id: promotion.campaignId } } } : {}),
        },
        select: PROMOTION_RECORD_SELECT,
      });
      return toRecord(row);
    } catch (error) {
      // connect() a una campaña inexistente produce P2025 en create: es una campaña, no la promoción.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025' && promotion.campaignId) {
        throw new CampaignNotFoundError(promotion.campaignId);
      }
      return translateWriteError(error, promotion);
    }
  }

  async update(promotion: Promotion): Promise<PromotionRecord> {
    try {
      const row = await this.prisma.promotion.update({
        where: { id: promotion.id, brandId: promotion.brandId },
        data: {
          ...writableData(promotion),
          campaign: promotion.campaignId ? { connect: { id: promotion.campaignId } } : { disconnect: true },
        },
        select: PROMOTION_RECORD_SELECT,
      });
      return toRecord(row);
    } catch (error) {
      return translateWriteError(error, promotion);
    }
  }
}
