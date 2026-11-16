import { type BrandRepository } from '../../application/ports';
import { type Brand } from '../../domain';
import { toBrand } from './prisma.mappers';
import { type PrismaService } from './prisma.service';

export class PrismaBrandRepository implements BrandRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveById(id: string): Promise<Brand | null> {
    const row = await this.prisma.brand.findFirst({ where: { id, active: true } });
    return row ? toBrand(row) : null;
  }
}
