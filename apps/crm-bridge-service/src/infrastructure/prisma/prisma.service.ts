import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type HealthIndicator } from '@capsur/nest-kit';
import { PrismaClient } from '../../../prisma/generated/client';
import { APP_CONFIG, type Env } from '../../config/env';

/** Cliente Prisma del servicio (generado en prisma/generated/client). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) env: Pick<Env, 'DATABASE_URL'>) {
    super({ datasourceUrl: env.DATABASE_URL });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Indicador `database` del health (crítico: sin base de datos el servicio está `down`). */
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
