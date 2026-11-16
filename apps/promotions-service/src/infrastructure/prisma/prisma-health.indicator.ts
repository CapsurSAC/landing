import { type HealthIndicator } from '@capsur/nest-kit';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * La base de datos es crítica: sin ella el servicio no puede responder. El
 * kit aplica el tiempo máximo y trata un rechazo como caída (B19).
 */
@Injectable()
export class PrismaHealthIndicator implements HealthIndicator {
  readonly name = 'database';
  readonly critical = true;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async check(): Promise<boolean> {
    await this.prisma.$queryRaw`SELECT 1`;
    return true;
  }
}
