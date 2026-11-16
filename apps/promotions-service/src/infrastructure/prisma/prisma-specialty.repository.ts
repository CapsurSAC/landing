import { type SpecialtyRepository } from '../../application/ports';
import { type Specialty, SpecialtyNotFoundError, type SpecialtyTrack } from '../../domain';
import { Prisma } from '../../../prisma/generated/client';
import { toSpecialty, trackToPrisma } from './prisma.mappers';
import { type PrismaService } from './prisma.service';

/** Columnas que usa el dominio (B12). */
const SPECIALTY_SELECT = {
  id: true,
  brandId: true,
  name: true,
  shortName: true,
  track: true,
  summary: true,
  audience: true,
  modality: true,
  endorsedBy: true,
  sortOrder: true,
  active: true,
} satisfies Prisma.SpecialtySelect;

const ORDER = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];

export class PrismaSpecialtyRepository implements SpecialtyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByBrand(brandId: string, track?: SpecialtyTrack): Promise<Specialty[]> {
    const rows = await this.prisma.specialty.findMany({
      where: {
        brandId,
        active: true,
        ...(track ? { track: trackToPrisma(track) } : {}),
      },
      select: SPECIALTY_SELECT,
      orderBy: ORDER,
    });
    return rows.map(toSpecialty);
  }

  async listByBrand(brandId: string): Promise<Specialty[]> {
    const rows = await this.prisma.specialty.findMany({
      where: { brandId },
      select: SPECIALTY_SELECT,
      orderBy: [{ active: 'desc' }, ...ORDER],
    });
    return rows.map(toSpecialty);
  }

  async update(specialty: Specialty): Promise<Specialty> {
    try {
      const row = await this.prisma.specialty.update({
        where: { id: specialty.id, brandId: specialty.brandId },
        data: {
          name: specialty.name,
          shortName: specialty.shortName,
          track: trackToPrisma(specialty.track),
          summary: specialty.summary,
          audience: [...specialty.audience],
          modality: specialty.modality,
          endorsedBy: specialty.endorsedBy,
          sortOrder: specialty.sortOrder,
          active: specialty.active,
        },
        select: SPECIALTY_SELECT,
      });
      return toSpecialty(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new SpecialtyNotFoundError(specialty.brandId, specialty.id);
      }
      throw error;
    }
  }
}
