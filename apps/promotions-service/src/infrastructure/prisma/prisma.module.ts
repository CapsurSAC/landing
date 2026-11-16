import { Global, Module } from '@nestjs/common';
import { PrismaAuditStore } from './prisma-audit.store';
import { PrismaHealthIndicator } from './prisma-health.indicator';
import { PrismaService } from './prisma.service';

/**
 * Cliente Prisma compartido: lo usan el catálogo, la auditoría y la salud.
 * Global para que los módulos del kit (AuditModule, HealthModule) lo resuelvan.
 */
@Global()
@Module({
  providers: [PrismaService, PrismaAuditStore, PrismaHealthIndicator],
  exports: [PrismaService, PrismaAuditStore, PrismaHealthIndicator],
})
export class PrismaModule {}
