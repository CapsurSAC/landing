import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { HealthIndicator } from '@capsur/nest-kit';
import { PrismaClient } from '../../../prisma/generated/client';
import { ENV, type Env } from '../../config/env';

/** Cliente Prisma con ciclo de vida de Nest. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');

  constructor(@Inject(ENV) env: Env) {
    super({
      datasourceUrl: env.DATABASE_URL,
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Conexión a PostgreSQL establecida');
    } catch (error) {
      // No bloqueamos el arranque: Prisma reconecta de forma perezosa en la
      // primera consulta y el health reporta `database: down` mientras tanto.
      this.logger.error(
        { err: error instanceof Error ? { type: error.name, message: error.message } : undefined },
        'No se pudo conectar a PostgreSQL al arrancar',
      );
    }
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
