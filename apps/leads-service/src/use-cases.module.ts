import { Module, type Provider } from '@nestjs/common';
import { CLOCK, type Clock } from './application/ports/clock';
import {
  COMPLAINT_REPOSITORY,
  PRIVACY_REQUEST_REPOSITORY,
  type ComplaintRepository,
  type PrivacyRequestRepository,
} from './application/ports/compliance-repository';
import { EVENT_PUBLISHER, type EventPublisher } from './application/ports/event-publisher';
import { IDEMPOTENCY_CACHE, type IdempotencyCache } from './application/ports/idempotency-cache';
import { LEAD_REPOSITORY, type LeadRepository } from './application/ports/lead-repository';
import { APP_LOGGER, type AppLogger } from './application/ports/logger';
import {
  DISTRIBUTED_LOCK,
  MAILER,
  NOTIFICATION_REPOSITORY,
  OUTBOX_SIGNAL,
  TEAM_NOTIFIER,
  type DistributedLock,
  type Mailer,
  type NotificationRepository,
  type OutboxSignal,
  type TeamNotifier,
} from './application/ports/notifications';
import { OUTBOX_REPOSITORY, type OutboxRepository } from './application/ports/outbox-repository';
import { PROCESSED_EVENT_REPOSITORY, type ProcessedEventRepository } from './application/ports/processed-event-repository';
import { PROMOTION_CATALOG, type PromotionCatalog } from './application/ports/promotion-catalog';
import { REPORT_REPOSITORY, type ReportRepository } from './application/ports/report-repository';
import {
  CAPTCHA_VERIFIER,
  PERSONAL_DATA_HASHER,
  RATE_LIMITER,
  type CaptchaVerifier,
  type PersonalDataHasher,
  type RateLimiter,
} from './application/ports/security';
import { SUBMISSION_REPOSITORY, type SubmissionRepository } from './application/ports/submission-repository';
import { TRACKING_REPOSITORY, type TrackingRepository } from './application/ports/tracking-repository';
import { LeadTokenSigner } from './application/support/lead-token';
import { AdminLeads } from './application/use-cases/admin-leads';
import { AnonymizeExpiredLeads, AnonymizeLead } from './application/use-cases/anonymize-lead';
import { ApplyCrmStatusEvent } from './application/use-cases/apply-crm-status-event';
import {
  ManageComplaints,
  ManagePrivacyRequests,
  SubmitComplaint,
  SubmitPrivacyRequest,
  type ComplianceSettings,
} from './application/use-cases/compliance';
import { CreateLead } from './application/use-cases/create-lead';
import { DispatchNotifications } from './application/use-cases/dispatch-notifications';
import { GetLeadStatus } from './application/use-cases/get-lead-status';
import { RecordTrackingEvent } from './application/use-cases/record-tracking-event';
import { RelayOutbox } from './application/use-cases/relay-outbox';
import { BuildDailyReport, BuildFunnelReport, SendDailyReport } from './application/use-cases/reports';
import { SubmitLeadFeedback } from './application/use-cases/submit-lead-feedback';
import {
  ADMIN_LEADS,
  ANONYMIZE_EXPIRED_LEADS,
  ANONYMIZE_LEAD,
  APPLY_CRM_STATUS_EVENT,
  BUILD_DAILY_REPORT,
  BUILD_FUNNEL_REPORT,
  CREATE_LEAD,
  DISPATCH_NOTIFICATIONS,
  GET_LEAD_STATUS,
  LEAD_TOKEN_SIGNER,
  MANAGE_COMPLAINTS,
  MANAGE_PRIVACY_REQUESTS,
  RECORD_TRACKING_EVENT,
  RELAY_OUTBOX,
  SEND_DAILY_REPORT,
  SUBMIT_COMPLAINT,
  SUBMIT_LEAD_FEEDBACK,
  SUBMIT_PRIVACY_REQUEST,
} from './application/use-cases/tokens';
import { ENV, type Env } from './config/env';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

const COMPLIANCE_SETTINGS = Symbol('COMPLIANCE_SETTINGS');

const providers: Provider[] = [
  {
    provide: LEAD_TOKEN_SIGNER,
    useFactory: (env: Env) => new LeadTokenSigner(env.LEAD_TOKEN_SECRET),
    inject: [ENV],
  },
  {
    provide: COMPLIANCE_SETTINGS,
    useFactory: (env: Env): ComplianceSettings => ({
      codePrefix: env.REFERENCE_PREFIX,
      holidays: new Set(env.PERU_HOLIDAYS),
    }),
    inject: [ENV],
  },
  {
    provide: CREATE_LEAD,
    useFactory: (
      leads: LeadRepository,
      submissions: SubmissionRepository,
      catalog: PromotionCatalog,
      cache: IdempotencyCache,
      captcha: CaptchaVerifier,
      rateLimiter: RateLimiter,
      hasher: PersonalDataHasher,
      tokens: LeadTokenSigner,
      outboxSignal: OutboxSignal,
      clock: Clock,
      logger: AppLogger,
      env: Env,
    ) =>
      new CreateLead({
        leads,
        submissions,
        catalog,
        cache,
        captcha,
        rateLimiter,
        hasher,
        tokens,
        outboxSignal,
        clock,
        logger,
        settings: {
          whatsappNumber: env.WHATSAPP_NUMBER,
          brandDisplayName: env.BRAND_DISPLAY_NAME,
          referencePrefix: env.REFERENCE_PREFIX,
          phoneRateLimitPerHour: env.LEADS_PHONE_RATE_LIMIT_PER_HOUR,
          confirmationEmailEnabled: Boolean(env.SMTP_URL),
        },
      }),
    inject: [
      LEAD_REPOSITORY,
      SUBMISSION_REPOSITORY,
      PROMOTION_CATALOG,
      IDEMPOTENCY_CACHE,
      CAPTCHA_VERIFIER,
      RATE_LIMITER,
      PERSONAL_DATA_HASHER,
      LEAD_TOKEN_SIGNER,
      OUTBOX_SIGNAL,
      CLOCK,
      APP_LOGGER,
      ENV,
    ],
  },
  {
    provide: GET_LEAD_STATUS,
    useFactory: (leads: LeadRepository, tokens: LeadTokenSigner) => new GetLeadStatus(leads, tokens),
    inject: [LEAD_REPOSITORY, LEAD_TOKEN_SIGNER],
  },
  {
    provide: SUBMIT_LEAD_FEEDBACK,
    useFactory: (leads: LeadRepository, tokens: LeadTokenSigner, outboxSignal: OutboxSignal, clock: Clock, logger: AppLogger) =>
      new SubmitLeadFeedback({ leads, tokens, outboxSignal, clock, logger }),
    inject: [LEAD_REPOSITORY, LEAD_TOKEN_SIGNER, OUTBOX_SIGNAL, CLOCK, APP_LOGGER],
  },
  {
    provide: RECORD_TRACKING_EVENT,
    useFactory: (tracking: TrackingRepository, clock: Clock) => new RecordTrackingEvent(tracking, clock),
    inject: [TRACKING_REPOSITORY, CLOCK],
  },
  {
    provide: APPLY_CRM_STATUS_EVENT,
    useFactory: (leads: LeadRepository, processed: ProcessedEventRepository, clock: Clock, logger: AppLogger) =>
      new ApplyCrmStatusEvent(leads, processed, clock, logger),
    inject: [LEAD_REPOSITORY, PROCESSED_EVENT_REPOSITORY, CLOCK, APP_LOGGER],
  },
  {
    provide: RELAY_OUTBOX,
    useFactory: (outbox: OutboxRepository, leads: LeadRepository, publisher: EventPublisher, clock: Clock, logger: AppLogger) =>
      new RelayOutbox(outbox, leads, publisher, clock, logger),
    inject: [OUTBOX_REPOSITORY, LEAD_REPOSITORY, EVENT_PUBLISHER, CLOCK, APP_LOGGER],
  },
  {
    provide: ANONYMIZE_LEAD,
    useFactory: (leads: LeadRepository, outboxSignal: OutboxSignal, clock: Clock, logger: AppLogger) =>
      new AnonymizeLead({ leads, outboxSignal, clock, logger }),
    inject: [LEAD_REPOSITORY, OUTBOX_SIGNAL, CLOCK, APP_LOGGER],
  },
  {
    provide: ANONYMIZE_EXPIRED_LEADS,
    useFactory: (leads: LeadRepository, anonymizeLead: AnonymizeLead, clock: Clock, logger: AppLogger, env: Env) =>
      new AnonymizeExpiredLeads({ leads, anonymizeLead, clock, logger, retentionDays: env.LEAD_RETENTION_DAYS }),
    inject: [LEAD_REPOSITORY, ANONYMIZE_LEAD, CLOCK, APP_LOGGER, ENV],
  },
  {
    provide: SUBMIT_COMPLAINT,
    useFactory: (
      complaints: ComplaintRepository,
      captcha: CaptchaVerifier,
      hasher: PersonalDataHasher,
      clock: Clock,
      logger: AppLogger,
      settings: ComplianceSettings,
    ) => new SubmitComplaint({ complaints, captcha, hasher, clock, logger, settings }),
    inject: [COMPLAINT_REPOSITORY, CAPTCHA_VERIFIER, PERSONAL_DATA_HASHER, CLOCK, APP_LOGGER, COMPLIANCE_SETTINGS],
  },
  {
    provide: MANAGE_COMPLAINTS,
    useFactory: (complaints: ComplaintRepository, clock: Clock, logger: AppLogger) =>
      new ManageComplaints({ complaints, clock, logger }),
    inject: [COMPLAINT_REPOSITORY, CLOCK, APP_LOGGER],
  },
  {
    provide: SUBMIT_PRIVACY_REQUEST,
    useFactory: (
      requests: PrivacyRequestRepository,
      captcha: CaptchaVerifier,
      hasher: PersonalDataHasher,
      clock: Clock,
      logger: AppLogger,
      settings: ComplianceSettings,
    ) => new SubmitPrivacyRequest({ requests, captcha, hasher, clock, logger, settings }),
    inject: [PRIVACY_REQUEST_REPOSITORY, CAPTCHA_VERIFIER, PERSONAL_DATA_HASHER, CLOCK, APP_LOGGER, COMPLIANCE_SETTINGS],
  },
  {
    provide: MANAGE_PRIVACY_REQUESTS,
    useFactory: (
      requests: PrivacyRequestRepository,
      leads: LeadRepository,
      anonymizeLead: AnonymizeLead,
      clock: Clock,
      logger: AppLogger,
    ) => new ManagePrivacyRequests({ requests, leads, anonymizeLead, clock, logger }),
    inject: [PRIVACY_REQUEST_REPOSITORY, LEAD_REPOSITORY, ANONYMIZE_LEAD, CLOCK, APP_LOGGER],
  },
  {
    provide: ADMIN_LEADS,
    useFactory: (leads: LeadRepository, hasher: PersonalDataHasher, anonymizeLead: AnonymizeLead) =>
      new AdminLeads({ leads, hasher, anonymizeLead }),
    inject: [LEAD_REPOSITORY, PERSONAL_DATA_HASHER, ANONYMIZE_LEAD],
  },
  {
    provide: BUILD_FUNNEL_REPORT,
    useFactory: (reports: ReportRepository) => new BuildFunnelReport(reports),
    inject: [REPORT_REPOSITORY],
  },
  {
    provide: BUILD_DAILY_REPORT,
    useFactory: (reports: ReportRepository) => new BuildDailyReport(reports),
    inject: [REPORT_REPOSITORY],
  },
  {
    provide: SEND_DAILY_REPORT,
    useFactory: (
      buildDailyReport: BuildDailyReport,
      notifier: TeamNotifier,
      lock: DistributedLock,
      clock: Clock,
      logger: AppLogger,
      env: Env,
    ) =>
      new SendDailyReport({
        buildDailyReport,
        notifier,
        lock,
        clock,
        logger,
        brand: 'sis',
        brandDisplayName: env.BRAND_DISPLAY_NAME,
      }),
    inject: [BUILD_DAILY_REPORT, TEAM_NOTIFIER, DISTRIBUTED_LOCK, CLOCK, APP_LOGGER, ENV],
  },
  {
    provide: DISPATCH_NOTIFICATIONS,
    useFactory: (
      notifications: NotificationRepository,
      leads: LeadRepository,
      mailer: Mailer,
      clock: Clock,
      logger: AppLogger,
      env: Env,
    ) =>
      new DispatchNotifications({
        notifications,
        leads,
        mailer,
        clock,
        logger,
        settings: { whatsappNumber: env.WHATSAPP_NUMBER, brandDisplayName: env.BRAND_DISPLAY_NAME },
      }),
    inject: [NOTIFICATION_REPOSITORY, LEAD_REPOSITORY, MAILER, CLOCK, APP_LOGGER, ENV],
  },
];

/** Casos de uso como clases planas, cableados con `useFactory` sobre los puertos. */
@Module({
  imports: [InfrastructureModule],
  providers,
  exports: [
    LEAD_TOKEN_SIGNER,
    CREATE_LEAD,
    GET_LEAD_STATUS,
    SUBMIT_LEAD_FEEDBACK,
    RECORD_TRACKING_EVENT,
    APPLY_CRM_STATUS_EVENT,
    RELAY_OUTBOX,
    ANONYMIZE_LEAD,
    ANONYMIZE_EXPIRED_LEADS,
    SUBMIT_COMPLAINT,
    MANAGE_COMPLAINTS,
    SUBMIT_PRIVACY_REQUEST,
    MANAGE_PRIVACY_REQUESTS,
    ADMIN_LEADS,
    BUILD_FUNNEL_REPORT,
    BUILD_DAILY_REPORT,
    SEND_DAILY_REPORT,
    DISPATCH_NOTIFICATIONS,
    InfrastructureModule,
  ],
})
export class UseCasesModule {}
