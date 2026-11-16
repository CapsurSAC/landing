import { type LevelWithSilent } from 'pino';
import { AuditModule, createLoggerModule, HealthModule, InternalAuthModule } from '@capsur/nest-kit';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CatalogModule } from './catalog.module';
import { type Env, validateEnv } from './config/env';
import { PrismaAuditStore } from './infrastructure/prisma/prisma-audit.store';
import { PrismaHealthIndicator } from './infrastructure/prisma/prisma-health.indicator';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { registerCatalogDomainErrors } from './presentation/http/domain-errors';
import { SERVICE_NAME, SERVICE_VERSION } from './service-info';

registerCatalogDomainErrors();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // En pruebas el entorno lo fija el propio test; no se lee .env del disco.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    // Logs JSON con redacción de datos personales y x-request-id (B21, C26).
    createLoggerModule({ service: SERVICE_NAME, level: process.env.LOG_LEVEL as LevelWithSilent | undefined }),
    // Token de servicio obligatorio en /internal/* salvo health (C4).
    InternalAuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        tokensJson: config.get('INTERNAL_API_TOKENS', { infer: true }),
      }),
    }),
    PrismaModule,
    AuditModule.forRoot({ store: PrismaAuditStore }),
    HealthModule.forRoot({ service: SERVICE_NAME, version: SERVICE_VERSION, indicators: [PrismaHealthIndicator] }),
    CatalogModule,
  ],
})
export class AppModule {}
