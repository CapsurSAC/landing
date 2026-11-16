/**
 * @capsur/nest-kit: piezas transversales de los microservicios NestJS.
 * Sin lógica de negocio. Ver README.md para ejemplos por bloque.
 */

// 1. Validación y errores (B4)
export {
  ProblemException,
  ValidationException,
  type FieldError,
  type ProblemDetailsBody,
  type ProblemOptions,
} from './errors/problem-exception';
export { ZodValidationPipe, zodIssuesToFieldErrors, ROOT_PATH } from './errors/zod-validation.pipe';
export {
  ProblemDetailsFilter,
  DOMAIN_ERROR_REGISTRY,
  defaultProblemCode,
  defaultProblemTitle,
} from './errors/problem-details.filter';
export {
  DomainErrorRegistry,
  defaultDomainErrorRegistry,
  mapDomainError,
  registerDomainErrors,
  type DomainErrorEntry,
  type DomainErrorMapping,
  type ErrorClass,
} from './errors/domain-error-registry';

// 2. Logging (B21, C26)
export {
  createLoggerModule,
  buildLoggerParams,
  buildPinoOptions,
  type LoggerModuleOptions,
} from './logging/logger.module';
export {
  REDACT_PATHS,
  REDACTED,
  PII_FIELD_NAMES,
  SENSITIVE_HEADER_NAMES,
  isSensitiveKey,
  redactDeep,
  scrubText,
} from './logging/redaction';
export { REQUEST_ID_HEADER, resolveRequestId, isValidRequestId } from './logging/request-id';

// 3. Bootstrap (C12, C14, C23)
export {
  bootstrapService,
  isSwaggerEnabled,
  SWAGGER_JSON_PATH,
  SWAGGER_UI_PATH,
  type BootstrapOptions,
  type BootstrapSwaggerOptions,
  type ListenFunction,
} from './bootstrap/bootstrap-service';
export { jsonOnlyMiddleware, isJsonContentType } from './bootstrap/json-only.middleware';

// 4. Autenticación entre servicios y auditoría (C4, C24)
export {
  InternalAuthModule,
  INTERNAL_AUTH_OPTIONS,
  type InternalAuthModuleOptions,
  type InternalAuthModuleAsyncOptions,
} from './auth/internal-auth.module';
export { InternalAuthGuard, InternalPathsAuthGuard, readActor, unauthorizedProblem } from './auth/internal-auth.guard';
export { InternalTokenVerifier, parseInternalTokens, type InternalTokens } from './auth/internal-token-verifier';
export {
  Public,
  InternalCaller,
  InternalActor,
  IS_PUBLIC_KEY,
  type InternalRequest,
} from './auth/decorators';
export {
  AuditService,
  AUDIT_STORE,
  LogOnlyAuditStore,
  MAX_AUDIT_LIST_LIMIT,
  type AuditEntry,
  type AuditInput,
  type AuditStore,
} from './audit/audit.service';
export { Audited, AuditInterceptor, AUDIT_METADATA_KEY, type AuditedOptions } from './audit/audited';
export { AuditModule, type AuditModuleOptions } from './audit/audit.module';

// 5. Health (B19)
export {
  HealthService,
  createHealthIndicator,
  HEALTH_EXTRAS,
  HEALTH_INDICATORS,
  HEALTH_OPTIONS,
  type HealthExtras,
  type HealthIndicator,
  type HealthModuleOptions,
  type HealthReport,
} from './health/health.service';
export { HealthModule, type HealthModuleRootOptions } from './health/health.module';
export { HealthController } from './health/health.controller';

// 6. Rate limiting distribuido (C2)
export { RedisThrottlerStorage, type ThrottlerStorageRecordLike } from './rate-limit/redis-throttler-storage';
export { RedisRateLimiter, type RateLimitDecision } from './rate-limit/redis-rate-limiter';
export {
  ResilientRedisCounter,
  createRedisClient,
  RATE_LIMIT_SCRIPT,
  type RedisCounterOptions,
  type RedisScriptClient,
} from './rate-limit/redis-counter';
export { MemoryRateCounterStore, type RateCounterResult, type RateCounterStore } from './rate-limit/rate-limit-store';

// 7. Datos personales (C8)
export { PiiCipher, PiiDecryptionError, hmacHash, hashIp, decodeKey32, decodeHmacKey } from './pii/pii-cipher';

// 8. RabbitMQ (B5, B20)
export {
  RabbitMqConnection,
  RABBITMQ_OPTIONS,
  BrokerUnavailableError,
  type RabbitMqConnectionOptions,
  type QueueStats,
  type ConnectionListener,
} from './rabbitmq/rabbitmq-connection';
export { RabbitMqPublisher, PublishFailedError } from './rabbitmq/rabbitmq-publisher';
export {
  RabbitMqConsumer,
  type ConsumerOptions,
  type MessageControls,
  type MessageHandler,
} from './rabbitmq/rabbitmq-consumer';
export { RabbitMqModule, rabbitMqHealthIndicator, type RabbitMqModuleAsyncOptions } from './rabbitmq/rabbitmq.module';
export {
  buildEnvelope,
  versionFromEventName,
  EVENT_PUBLISHER,
  type EnvelopeOptions,
  type EventEnvelope,
  type EventPublisher,
} from './rabbitmq/envelope';

// 9. Sentry (C23)
export {
  initSentry,
  scrubSentryEvent,
  reportServerError,
  setErrorReporter,
  type ErrorReporter,
  type InitSentryOptions,
  type SentryEventLike,
} from './sentry';

// 10. Turnstile (C3)
export {
  TurnstileVerifier,
  TURNSTILE_VERIFY_URL,
  type FetchLike,
  type TurnstileResult,
  type TurnstileStatus,
  type TurnstileVerifierOptions,
} from './security/turnstile-verifier';

// 11. Seguridad de URLs (C20)
export {
  assertAllowedUrl,
  isAllowedUrl,
  parseAllowlist,
  UrlNotAllowedError,
  type AllowedUrlOptions,
} from './security/url-allowlist';
