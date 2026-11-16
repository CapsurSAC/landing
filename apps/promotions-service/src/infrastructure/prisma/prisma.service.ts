import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Prisma, PrismaClient } from '../../../prisma/generated/client';

/**
 * Cliente Prisma como proveedor de Nest. Conecta al arrancar y cierra la
 * conexión con los shutdown hooks de la aplicación. Los avisos y errores del
 * motor se reenvían al logger de la aplicación (pino).
 */
@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'warn' | 'error'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }] });
    this.$on('warn', (event) => this.logger.warn(event.message));
    this.$on('error', (event) => this.logger.error(event.message));
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // La primera consulta calienta el motor de Prisma (puede tardar > 1 s).
    // Hacerla aquí evita que el primer chequeo de salud (límite 1,5 s) dé un falso «down».
    await this.$queryRaw`SELECT 1`;
    this.logger.log('Conexión a PostgreSQL establecida');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
