import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { AuditModule, EVENT_PUBLISHER, HealthModule, InternalAuthModule, RabbitMqModule } from '@capsur/nest-kit';
import { LoggerModule, PinoLogger } from 'nestjs-pino';
import { type ChatwootGateway } from './application/ports/chatwoot-gateway';
import { type Clock } from './application/ports/clock';
import { type EventPublisher } from './application/ports/event-publisher';
import { type MetaCapiClient } from './application/ports/meta-capi-client';
import { type QueueInspector } from './application/ports/queue-inspector';
import {
  type AttemptRepository,
  type ContactLinkRepository,
  type FollowupRepository,
  type MetaCapiEventRepository,
  type PersonalDataEraser,
  type ProcessedEventRepository,
  type SyncJobRepository,
  type WebhookEventRepository,
} from './application/ports/repositories';
import {
  ANONYMIZE_RETRY_DELAY_MS,
  ASSIGNMENT_POLICY,
  ATTEMPT_REPOSITORY,
  CHATWOOT_GATEWAY,
  CLOCK,
  CONTACT_LINK_REPOSITORY,
  FOLLOWUP_REPOSITORY,
  META_CAPI_CLIENT,
  META_CAPI_EVENT_REPOSITORY,
  PERSONAL_DATA_ERASER,
  PROCESSED_EVENT_REPOSITORY,
  QUEUE_INSPECTOR,
  SYNC_JOB_REPOSITORY,
  WEBHOOK_EVENT_REPOSITORY,
} from './application/ports/tokens';
import { AgentDirectory } from './application/services/agent-directory';
import { AnonymizeLead } from './application/use-cases/anonymize-lead';
import { ApplyLeadFeedback } from './application/use-cases/apply-lead-feedback';
import { GetIntegrationSummary } from './application/use-cases/get-integration-summary';
import { HandleChatwootWebhook } from './application/use-cases/handle-chatwoot-webhook';
import { ProcessWhatsappFollowups } from './application/use-cases/process-whatsapp-followups';
import { RetryFailedSyncs } from './application/use-cases/retry-failed-syncs';
import { SendMetaLeadEvent } from './application/use-cases/send-meta-lead-event';
import { SyncLeadToChatwoot } from './application/use-cases/sync-lead-to-chatwoot';
import { type Env, inboxResolver, isChatwootConfigured, isFollowupEnabled } from './config/env';
import { readServiceVersion, SERVICE_NAME } from './config/service-info';
import { type AssignmentPolicy } from './domain/assignment-policy';
import { ChatwootHealthIndicator, RabbitHealthIndicator } from './infrastructure/health/indicators';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { loggerParams } from './infrastructure/logging/logger-params';
import { PinoLoggerAdapter } from './infrastructure/logging/pino-logger.adapter';
import { PrismaAuditStore } from './infrastructure/prisma/prisma-audit.store';
import { PrismaHealthIndicator } from './infrastructure/prisma/prisma.service';
import { LeadAnonymizedConsumer } from './presentation/consumers/lead-anonymized.consumer';
import { LeadCreatedConsumer } from './presentation/consumers/lead-created.consumer';
import { LeadFeedbackConsumer } from './presentation/consumers/lead-feedback.consumer';
import { MetaCapiConsumer } from './presentation/consumers/meta-capi.consumer';
import { AdminAuditController } from './presentation/http/admin-audit.controller';
import { ChatwootWebhookController } from './presentation/http/chatwoot-webhook.controller';
import { InternalIntegrationsController } from './presentation/http/internal-integrations.controller';
import { LegacyPayloadEncryptionTask } from './presentation/jobs/legacy-payload-encryption.task';
import { WhatsappFollowupJob } from './presentation/jobs/whatsapp-followup.job';

export interface AppModuleOptions {
  /** Pausa antes de reencolar un `lead.anonymized.v1` fallido. Por defecto 5000 ms. */
  anonymizeRetryDelayMs?: number;
}

function useCaseProviders(env: Env, options: AppModuleOptions): Provider[] {
  const inboxForCampus = inboxResolver(env);
  return [
    { provide: ANONYMIZE_RETRY_DELAY_MS, useValue: options.anonymizeRetryDelayMs ?? 5000 },
    {
      provide: AgentDirectory,
      inject: [CHATWOOT_GATEWAY, CLOCK],
      useFactory: (gateway: ChatwootGateway, clock: Clock): AgentDirectory => new AgentDirectory(gateway, clock),
    },
    {
      provide: SyncLeadToChatwoot,
      inject: [
        CHATWOOT_GATEWAY,
        CONTACT_LINK_REPOSITORY,
        SYNC_JOB_REPOSITORY,
        ATTEMPT_REPOSITORY,
        PROCESSED_EVENT_REPOSITORY,
        FOLLOWUP_REPOSITORY,
        EVENT_PUBLISHER,
        CLOCK,
        PinoLogger,
      ],
      useFactory: (
        gateway: ChatwootGateway,
        contactLinks: ContactLinkRepository,
        syncJobs: SyncJobRepository,
        attempts: AttemptRepository,
        processedEvents: ProcessedEventRepository,
        followups: FollowupRepository,
        publisher: EventPublisher,
        clock: Clock,
        pino: PinoLogger,
      ): SyncLeadToChatwoot =>
        new SyncLeadToChatwoot({
          gateway,
          contactLinks,
          syncJobs,
          attempts,
          processedEvents,
          publisher,
          clock,
          crmAccountId: env.CHATWOOT_ACCOUNT_ID,
          inboxForCampus,
          followup: isFollowupEnabled(env) ? { repository: followups, afterHours: env.WHATSAPP_FOLLOWUP_AFTER_HOURS } : null,
          logger: new PinoLoggerAdapter(pino, SyncLeadToChatwoot.name),
        }),
    },
    {
      provide: HandleChatwootWebhook,
      inject: [
        CHATWOOT_GATEWAY,
        CONTACT_LINK_REPOSITORY,
        SYNC_JOB_REPOSITORY,
        WEBHOOK_EVENT_REPOSITORY,
        ATTEMPT_REPOSITORY,
        FOLLOWUP_REPOSITORY,
        EVENT_PUBLISHER,
        CLOCK,
        ASSIGNMENT_POLICY,
        AgentDirectory,
        PinoLogger,
      ],
      useFactory: (
        gateway: ChatwootGateway,
        contactLinks: ContactLinkRepository,
        syncJobs: SyncJobRepository,
        webhookEvents: WebhookEventRepository,
        attempts: AttemptRepository,
        followups: FollowupRepository,
        publisher: EventPublisher,
        clock: Clock,
        assignmentPolicy: AssignmentPolicy,
        agentDirectory: AgentDirectory,
        pino: PinoLogger,
      ): HandleChatwootWebhook =>
        new HandleChatwootWebhook({
          gateway,
          contactLinks,
          syncJobs,
          webhookEvents,
          attempts,
          publisher,
          clock,
          assignmentPolicy,
          assignmentStrategy: env.ASSIGNMENT_STRATEGY,
          agentDirectory,
          autoReply: { enabled: env.CHATWOOT_AUTO_REPLY_ENABLED, catalogUrls: env.CATALOG_URLS_JSON },
          followups,
          logger: new PinoLoggerAdapter(pino, HandleChatwootWebhook.name),
        }),
    },
    {
      provide: RetryFailedSyncs,
      inject: [SYNC_JOB_REPOSITORY, SyncLeadToChatwoot, PinoLogger],
      useFactory: (syncJobs: SyncJobRepository, syncLead: SyncLeadToChatwoot, pino: PinoLogger): RetryFailedSyncs =>
        new RetryFailedSyncs({ syncJobs, syncLead, logger: new PinoLoggerAdapter(pino, RetryFailedSyncs.name) }),
    },
    {
      provide: ProcessWhatsappFollowups,
      inject: [CHATWOOT_GATEWAY, FOLLOWUP_REPOSITORY, CONTACT_LINK_REPOSITORY, SYNC_JOB_REPOSITORY, ATTEMPT_REPOSITORY, CLOCK, PinoLogger],
      useFactory: (
        gateway: ChatwootGateway,
        followups: FollowupRepository,
        contactLinks: ContactLinkRepository,
        syncJobs: SyncJobRepository,
        attempts: AttemptRepository,
        clock: Clock,
        pino: PinoLogger,
      ): ProcessWhatsappFollowups =>
        new ProcessWhatsappFollowups({
          gateway,
          followups,
          contactLinks,
          syncJobs,
          attempts,
          clock,
          template: { name: env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME ?? '', language: env.WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE },
          inboxForCampus,
          logger: new PinoLoggerAdapter(pino, ProcessWhatsappFollowups.name),
        }),
    },
    {
      provide: SendMetaLeadEvent,
      inject: [META_CAPI_CLIENT, META_CAPI_EVENT_REPOSITORY, CLOCK, PinoLogger],
      useFactory: (client: MetaCapiClient | null, events: MetaCapiEventRepository, clock: Clock, pino: PinoLogger): SendMetaLeadEvent =>
        new SendMetaLeadEvent({
          client,
          events,
          clock,
          testEventCode: env.META_CAPI_TEST_EVENT_CODE ?? null,
          logger: new PinoLoggerAdapter(pino, SendMetaLeadEvent.name),
        }),
    },
    {
      provide: ApplyLeadFeedback,
      inject: [CHATWOOT_GATEWAY, CONTACT_LINK_REPOSITORY, ATTEMPT_REPOSITORY, CLOCK, PinoLogger],
      useFactory: (
        gateway: ChatwootGateway,
        contactLinks: ContactLinkRepository,
        attempts: AttemptRepository,
        clock: Clock,
        pino: PinoLogger,
      ): ApplyLeadFeedback =>
        new ApplyLeadFeedback({ gateway, contactLinks, attempts, clock, logger: new PinoLoggerAdapter(pino, ApplyLeadFeedback.name) }),
    },
    {
      provide: AnonymizeLead,
      inject: [CHATWOOT_GATEWAY, CONTACT_LINK_REPOSITORY, PERSONAL_DATA_ERASER, CLOCK, PinoLogger],
      useFactory: (
        gateway: ChatwootGateway,
        contactLinks: ContactLinkRepository,
        eraser: PersonalDataEraser,
        clock: Clock,
        pino: PinoLogger,
      ): AnonymizeLead => new AnonymizeLead({ gateway, contactLinks, eraser, clock, logger: new PinoLoggerAdapter(pino, AnonymizeLead.name) }),
    },
    {
      provide: GetIntegrationSummary,
      inject: [SYNC_JOB_REPOSITORY, CONTACT_LINK_REPOSITORY, QUEUE_INSPECTOR, PinoLogger],
      useFactory: (syncJobs: SyncJobRepository, contactLinks: ContactLinkRepository, queues: QueueInspector, pino: PinoLogger): GetIntegrationSummary =>
        new GetIntegrationSummary({
          syncJobs,
          contactLinks,
          queues,
          chatwootConfigured: isChatwootConfigured(env),
          logger: new PinoLoggerAdapter(pino, GetIntegrationSummary.name),
        }),
    },
  ];
}

/**
 * Módulo raíz. Se construye con el entorno ya validado (`AppModule.register(env)`) para que
 * las pruebas de integración puedan arrancarlo contra contenedores propios.
 */
@Module({})
export class AppModule {
  static register(env: Env, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot(loggerParams(env)),
        InfrastructureModule.register(env),
        InternalAuthModule.forRoot({ tokensJson: env.INTERNAL_API_TOKENS }),
        AuditModule.forRoot({ store: PrismaAuditStore }),
        HealthModule.forRoot({
          service: SERVICE_NAME,
          version: readServiceVersion(),
          indicators: [PrismaHealthIndicator, RabbitHealthIndicator, ChatwootHealthIndicator],
        }),
        RabbitMqModule.forRoot({ url: env.RABBITMQ_URL, connectionName: SERVICE_NAME }),
      ],
      controllers: [ChatwootWebhookController, InternalIntegrationsController, AdminAuditController],
      providers: [
        ...useCaseProviders(env, options),
        LeadCreatedConsumer,
        MetaCapiConsumer,
        LeadFeedbackConsumer,
        LeadAnonymizedConsumer,
        WhatsappFollowupJob,
        LegacyPayloadEncryptionTask,
      ],
    };
  }
}
