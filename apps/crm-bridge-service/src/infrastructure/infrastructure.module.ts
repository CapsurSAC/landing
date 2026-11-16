import { type DynamicModule, Module } from '@nestjs/common';
import { PiiCipher } from '@capsur/nest-kit';
import { type ChatwootGateway } from '../application/ports/chatwoot-gateway';
import { type MetaCapiClient } from '../application/ports/meta-capi-client';
import {
  ASSIGNMENT_POLICY,
  ATTEMPT_REPOSITORY,
  CHATWOOT_GATEWAY,
  CLOCK,
  CONTACT_LINK_REPOSITORY,
  FOLLOWUP_REPOSITORY,
  META_CAPI_CLIENT,
  META_CAPI_EVENT_REPOSITORY,
  PERSONAL_DATA_ERASER,
  PII_CIPHER,
  PROCESSED_EVENT_REPOSITORY,
  QUEUE_INSPECTOR,
  SYNC_JOB_REPOSITORY,
  WEBHOOK_EVENT_REPOSITORY,
} from '../application/ports/tokens';
import { APP_CONFIG, type Env, isChatwootConfigured, isMetaCapiEnabled } from '../config/env';
import { AssignmentPolicy } from '../domain/assignment-policy';
import { HttpChatwootGateway } from './chatwoot/http-chatwoot-gateway';
import { SystemClock } from './clock/system-clock';
import { RabbitQueueInspector } from './health/indicators';
import { HttpMetaCapiClient } from './meta/http-meta-capi-client';
import { PrismaAttemptRepository } from './prisma/prisma-attempt.repository';
import { PrismaContactLinkRepository } from './prisma/prisma-contact-link.repository';
import { PrismaFollowupRepository } from './prisma/prisma-followup.repository';
import { PrismaMetaCapiEventRepository } from './prisma/prisma-meta-capi-event.repository';
import { PrismaPersonalDataEraser } from './prisma/prisma-personal-data-eraser';
import { PrismaProcessedEventRepository } from './prisma/prisma-processed-event.repository';
import { PrismaSyncJobRepository } from './prisma/prisma-sync-job.repository';
import { PrismaWebhookEventRepository } from './prisma/prisma-webhook-event.repository';
import { PrismaService } from './prisma/prisma.service';
import { IpAllowlist } from './security/ip-allowlist';
import { WebhookSignatureVerifier } from './security/webhook-signature-verifier';

/** Timeout de las llamadas a Chatwoot y a Meta. */
const HTTP_TIMEOUT_MS = 8000;

/**
 * Adaptadores (Prisma, Chatwoot, Meta, seguridad) y configuración. Global: lo usan los
 * módulos del kit (`AuditModule`, `HealthModule`) y el módulo de la aplicación.
 */
@Module({})
export class InfrastructureModule {
  static register(env: Env): DynamicModule {
    const exported = [
      APP_CONFIG,
      PrismaService,
      PII_CIPHER,
      CLOCK,
      CHATWOOT_GATEWAY,
      META_CAPI_CLIENT,
      ASSIGNMENT_POLICY,
      CONTACT_LINK_REPOSITORY,
      SYNC_JOB_REPOSITORY,
      ATTEMPT_REPOSITORY,
      PROCESSED_EVENT_REPOSITORY,
      WEBHOOK_EVENT_REPOSITORY,
      FOLLOWUP_REPOSITORY,
      META_CAPI_EVENT_REPOSITORY,
      PERSONAL_DATA_ERASER,
      QUEUE_INSPECTOR,
      WebhookSignatureVerifier,
      IpAllowlist,
    ];
    return {
      module: InfrastructureModule,
      global: true,
      providers: [
        { provide: APP_CONFIG, useValue: env },
        PrismaService,
        { provide: PII_CIPHER, useFactory: (): PiiCipher => new PiiCipher(env.PII_ENCRYPTION_KEY) },
        { provide: CLOCK, useClass: SystemClock },
        {
          provide: CHATWOOT_GATEWAY,
          useFactory: (): ChatwootGateway =>
            new HttpChatwootGateway({
              baseUrl: env.CHATWOOT_BASE_URL,
              accountId: env.CHATWOOT_ACCOUNT_ID,
              apiAccessToken: env.CHATWOOT_API_ACCESS_TOKEN,
              configured: isChatwootConfigured(env),
              timeoutMs: HTTP_TIMEOUT_MS,
            }),
        },
        {
          provide: META_CAPI_CLIENT,
          useFactory: (): MetaCapiClient | null =>
            isMetaCapiEnabled(env) && env.META_PIXEL_ID && env.META_CAPI_ACCESS_TOKEN
              ? new HttpMetaCapiClient({
                  baseUrl: env.META_GRAPH_BASE_URL,
                  pixelId: env.META_PIXEL_ID,
                  accessToken: env.META_CAPI_ACCESS_TOKEN,
                  timeoutMs: HTTP_TIMEOUT_MS,
                })
              : null,
        },
        {
          provide: ASSIGNMENT_POLICY,
          useFactory: (): AssignmentPolicy => new AssignmentPolicy(env.ASSIGNMENT_RULES_JSON, env.CHATWOOT_DEFAULT_TEAM_ID),
        },
        { provide: CONTACT_LINK_REPOSITORY, useClass: PrismaContactLinkRepository },
        { provide: SYNC_JOB_REPOSITORY, useClass: PrismaSyncJobRepository },
        { provide: ATTEMPT_REPOSITORY, useClass: PrismaAttemptRepository },
        { provide: PROCESSED_EVENT_REPOSITORY, useClass: PrismaProcessedEventRepository },
        { provide: WEBHOOK_EVENT_REPOSITORY, useClass: PrismaWebhookEventRepository },
        { provide: FOLLOWUP_REPOSITORY, useClass: PrismaFollowupRepository },
        { provide: META_CAPI_EVENT_REPOSITORY, useClass: PrismaMetaCapiEventRepository },
        { provide: PERSONAL_DATA_ERASER, useClass: PrismaPersonalDataEraser },
        { provide: QUEUE_INSPECTOR, useClass: RabbitQueueInspector },
        {
          provide: WebhookSignatureVerifier,
          useFactory: (): WebhookSignatureVerifier =>
            new WebhookSignatureVerifier(env.CHATWOOT_WEBHOOK_SECRET, env.CHATWOOT_WEBHOOK_SECRET_PREVIOUS),
        },
        { provide: IpAllowlist, useFactory: (): IpAllowlist => new IpAllowlist(env.WEBHOOK_IP_ALLOWLIST) },
      ],
      exports: exported,
    };
  }
}
