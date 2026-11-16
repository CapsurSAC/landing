import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AuditModule,
  HealthModule,
  InternalAuthModule,
  RabbitMqModule,
  RedisThrottlerStorage,
  createLoggerModule,
} from '@capsur/nest-kit';
import { AppConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { OutboxHealthExtras } from './infrastructure/health/health-registrations';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { PrismaAuditStore } from './infrastructure/prisma/prisma-audit.store';
import { PrismaHealthIndicator } from './infrastructure/prisma/prisma.service';
import { RedisConnection } from './infrastructure/redis/redis.provider';
import { CrmStatusConsumer } from './presentation/consumers/crm-status.consumer';
import { AdminController } from './presentation/http/admin.controller';
import { ComplianceController } from './presentation/http/compliance.controller';
import { registerLeadsDomainErrors } from './presentation/http/domain-errors';
import { LeadsController } from './presentation/http/leads.controller';
import { ReportsController } from './presentation/http/reports.controller';
import { TrackingController } from './presentation/http/tracking.controller';
import { NotificationWorker, PiiBackfillOnStartup, ScheduledJobs } from './presentation/workers/background-jobs';
import { OutboxRelayWorker } from './presentation/workers/outbox-relay';
import { UseCasesModule } from './use-cases.module';
import { SERVICE_NAME, SERVICE_VERSION } from './version';

export interface AppModuleOptions {
  /**
   * Consumidor de RabbitMQ, relay de outbox, correos, tareas diarias y
   * backfill. Las pruebas HTTP y la exportación de OpenAPI los desactivan.
   */
  workers?: boolean;
}

/**
 * Módulo raíz. Recibe el entorno ya validado (no lee `process.env`) para que
 * pruebas y `openapi:export` puedan construirlo con valores propios.
 */
@Module({})
export class AppModule {
  static forRoot(env: Env, options: AppModuleOptions = {}): DynamicModule {
    registerLeadsDomainErrors();

    const workers: Provider[] =
      options.workers === false
        ? []
        : [CrmStatusConsumer, OutboxRelayWorker, NotificationWorker, ScheduledJobs, PiiBackfillOnStartup];

    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(env),
        createLoggerModule({ service: SERVICE_NAME, level: env.LOG_LEVEL, nodeEnv: env.NODE_ENV }),
        InternalAuthModule.forRoot({ tokensJson: env.INTERNAL_API_TOKENS }),
        RabbitMqModule.forRoot({ url: env.RABBITMQ_URL, connectionName: SERVICE_NAME }),
        ThrottlerModule.forRootAsync({
          imports: [InfrastructureModule],
          inject: [RedisConnection],
          // Límite por defecto (C2): POST /api/v1/leads por IP, compartido en Redis entre réplicas.
          useFactory: (redis: RedisConnection) => ({
            throttlers: [{ name: 'default', ttl: 60_000, limit: env.LEADS_RATE_LIMIT_PER_MINUTE }],
            storage: new RedisThrottlerStorage(redis.client),
          }),
        }),
        HealthModule.forRoot({
          service: SERVICE_NAME,
          version: SERVICE_VERSION,
          imports: [InfrastructureModule],
          indicators: [PrismaHealthIndicator],
          extras: OutboxHealthExtras,
        }),
        AuditModule.forRoot({ imports: [InfrastructureModule], store: PrismaAuditStore }),
        UseCasesModule,
      ],
      controllers: [LeadsController, TrackingController, ComplianceController, AdminController, ReportsController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, ...workers],
    };
  }
}
