import { Module, type Provider } from '@nestjs/common';
import { RabbitMqPublisher, TurnstileVerifier } from '@capsur/nest-kit';
import { PinoLogger } from 'nestjs-pino';
import { CLOCK, type Clock } from '../application/ports/clock';
import { COMPLAINT_REPOSITORY, PRIVACY_REQUEST_REPOSITORY } from '../application/ports/compliance-repository';
import { EVENT_PUBLISHER } from '../application/ports/event-publisher';
import { IDEMPOTENCY_CACHE, type IdempotencyCache } from '../application/ports/idempotency-cache';
import { LEAD_REPOSITORY } from '../application/ports/lead-repository';
import { APP_LOGGER } from '../application/ports/logger';
import {
  DISTRIBUTED_LOCK,
  MAILER,
  NOTIFICATION_REPOSITORY,
  OUTBOX_SIGNAL,
  TEAM_NOTIFIER,
  type DistributedLock,
  type Mailer,
  type TeamNotifier,
} from '../application/ports/notifications';
import { OUTBOX_REPOSITORY } from '../application/ports/outbox-repository';
import { PROCESSED_EVENT_REPOSITORY } from '../application/ports/processed-event-repository';
import { PROMOTION_CATALOG } from '../application/ports/promotion-catalog';
import { REPORT_REPOSITORY } from '../application/ports/report-repository';
import {
  CAPTCHA_VERIFIER,
  PERSONAL_DATA_HASHER,
  RATE_LIMITER,
  type CaptchaVerifier,
  type RateLimiter,
} from '../application/ports/security';
import { SUBMISSION_REPOSITORY } from '../application/ports/submission-repository';
import { TRACKING_REPOSITORY } from '../application/ports/tracking-repository';
import { ENV, type Env } from '../config/env';
import { NullIdempotencyCache } from './cache/null-idempotency-cache';
import { RedisIdempotencyCache } from './cache/redis-idempotency-cache';
import { SystemClock } from './clock/system-clock';
import { HealthRegistrations, OutboxHealthExtras } from './health/health-registrations';
import { HttpPromotionCatalog } from './http/http-promotion-catalog';
import { PinoAppLogger } from './logging/pino-app-logger';
import { DisabledMailer, NodemailerMailer } from './notifications/nodemailer-mailer';
import { WebhookTeamNotifier } from './notifications/webhook-team-notifier';
import { InProcessOutboxSignal } from './outbox/in-process-outbox-signal';
import { PII_CODEC, PiiCodec } from './pii/pii-codec';
import { PrismaAuditStore } from './prisma/prisma-audit.store';
import { PrismaComplaintRepository, PrismaPrivacyRequestRepository } from './prisma/prisma-compliance.repository';
import { PrismaLeadRepository } from './prisma/prisma-lead.repository';
import { PrismaNotificationRepository } from './prisma/prisma-notification.repository';
import { PrismaOutboxRepository } from './prisma/prisma-outbox.repository';
import { PrismaProcessedEventRepository } from './prisma/prisma-processed-event.repository';
import { PrismaReportRepository } from './prisma/prisma-report.repository';
import { PrismaSubmissionRepository } from './prisma/prisma-submission.repository';
import { PrismaTrackingRepository } from './prisma/prisma-tracking.repository';
import { PrismaService } from './prisma/prisma.service';
import { RedisConnection } from './redis/redis.provider';
import {
  KitRateLimiter,
  MemoryDistributedLock,
  RedisDistributedLock,
  TurnstileCaptchaVerifier,
} from './security/security-adapters';

/** Sin webhook configurado el reporte diario no se programa; este notificador nunca se usa. */
class DisabledTeamNotifier implements TeamNotifier {
  async postText(): Promise<void> {
    throw new Error('DAILY_REPORT_WEBHOOK_URL no está configurado');
  }
}

const providers: Provider[] = [
  PrismaService,
  RedisConnection,
  HealthRegistrations,
  OutboxHealthExtras,
  PrismaAuditStore,
  { provide: CLOCK, useClass: SystemClock },
  {
    provide: APP_LOGGER,
    useFactory: (logger: PinoLogger) => new PinoAppLogger(logger, 'application'),
    inject: [PinoLogger],
  },
  {
    provide: PII_CODEC,
    useFactory: (env: Env) => new PiiCodec(env.PII_ENCRYPTION_KEY, env.PII_HASH_KEY),
    inject: [ENV],
  },
  { provide: PERSONAL_DATA_HASHER, useExisting: PII_CODEC },
  { provide: LEAD_REPOSITORY, useClass: PrismaLeadRepository },
  { provide: SUBMISSION_REPOSITORY, useClass: PrismaSubmissionRepository },
  { provide: OUTBOX_REPOSITORY, useClass: PrismaOutboxRepository },
  { provide: TRACKING_REPOSITORY, useClass: PrismaTrackingRepository },
  { provide: PROCESSED_EVENT_REPOSITORY, useClass: PrismaProcessedEventRepository },
  { provide: COMPLAINT_REPOSITORY, useClass: PrismaComplaintRepository },
  { provide: PRIVACY_REQUEST_REPOSITORY, useClass: PrismaPrivacyRequestRepository },
  { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
  { provide: REPORT_REPOSITORY, useClass: PrismaReportRepository },
  { provide: EVENT_PUBLISHER, useExisting: RabbitMqPublisher },
  { provide: OUTBOX_SIGNAL, useFactory: () => new InProcessOutboxSignal() },
  {
    provide: PROMOTION_CATALOG,
    useFactory: (env: Env, clock: Clock, logger: PinoLogger) =>
      new HttpPromotionCatalog(
        { baseUrl: env.PROMOTIONS_SERVICE_URL, token: env.PROMOTIONS_SERVICE_TOKEN },
        clock,
        new PinoAppLogger(logger, HttpPromotionCatalog.name),
      ),
    inject: [ENV, CLOCK, PinoLogger],
  },
  {
    provide: IDEMPOTENCY_CACHE,
    useFactory: (redis: RedisConnection, codec: PiiCodec): IdempotencyCache =>
      redis.client ? new RedisIdempotencyCache(redis.client, codec) : new NullIdempotencyCache(),
    inject: [RedisConnection, PII_CODEC],
  },
  {
    provide: RATE_LIMITER,
    useFactory: (redis: RedisConnection): RateLimiter => new KitRateLimiter(redis.client),
    inject: [RedisConnection],
  },
  {
    provide: DISTRIBUTED_LOCK,
    useFactory: (redis: RedisConnection): DistributedLock =>
      redis.client ? new RedisDistributedLock(redis.client) : new MemoryDistributedLock(),
    inject: [RedisConnection],
  },
  {
    provide: CAPTCHA_VERIFIER,
    useFactory: (env: Env): CaptchaVerifier =>
      new TurnstileCaptchaVerifier(new TurnstileVerifier({ secret: env.TURNSTILE_SECRET_KEY ?? '' })),
    inject: [ENV],
  },
  {
    provide: MAILER,
    useFactory: (env: Env): Mailer => (env.SMTP_URL ? NodemailerMailer.fromUrl(env.SMTP_URL, env.MAIL_FROM) : new DisabledMailer()),
    inject: [ENV],
  },
  {
    provide: TEAM_NOTIFIER,
    useFactory: (env: Env): TeamNotifier =>
      env.DAILY_REPORT_WEBHOOK_URL ? new WebhookTeamNotifier(env.DAILY_REPORT_WEBHOOK_URL) : new DisabledTeamNotifier(),
    inject: [ENV],
  },
];

@Module({
  providers,
  exports: [
    PrismaService,
    RedisConnection,
    OutboxHealthExtras,
    PrismaAuditStore,
    CLOCK,
    APP_LOGGER,
    PII_CODEC,
    PERSONAL_DATA_HASHER,
    LEAD_REPOSITORY,
    SUBMISSION_REPOSITORY,
    OUTBOX_REPOSITORY,
    TRACKING_REPOSITORY,
    PROCESSED_EVENT_REPOSITORY,
    COMPLAINT_REPOSITORY,
    PRIVACY_REQUEST_REPOSITORY,
    NOTIFICATION_REPOSITORY,
    REPORT_REPOSITORY,
    EVENT_PUBLISHER,
    OUTBOX_SIGNAL,
    PROMOTION_CATALOG,
    IDEMPOTENCY_CACHE,
    RATE_LIMITER,
    DISTRIBUTED_LOCK,
    CAPTCHA_VERIFIER,
    MAILER,
    TEAM_NOTIFIER,
  ],
})
export class InfrastructureModule {}
