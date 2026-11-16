/**
 * Tokens de inyección para enlazar puertos con adaptadores en los módulos de Nest.
 * El publicador de eventos usa `EVENT_PUBLISHER` de `@capsur/nest-kit`.
 */
export const CHATWOOT_GATEWAY = Symbol('CHATWOOT_GATEWAY');
export const META_CAPI_CLIENT = Symbol('META_CAPI_CLIENT');
export const CONTACT_LINK_REPOSITORY = Symbol('CONTACT_LINK_REPOSITORY');
export const SYNC_JOB_REPOSITORY = Symbol('SYNC_JOB_REPOSITORY');
export const ATTEMPT_REPOSITORY = Symbol('ATTEMPT_REPOSITORY');
export const PROCESSED_EVENT_REPOSITORY = Symbol('PROCESSED_EVENT_REPOSITORY');
export const WEBHOOK_EVENT_REPOSITORY = Symbol('WEBHOOK_EVENT_REPOSITORY');
export const FOLLOWUP_REPOSITORY = Symbol('FOLLOWUP_REPOSITORY');
export const META_CAPI_EVENT_REPOSITORY = Symbol('META_CAPI_EVENT_REPOSITORY');
export const PERSONAL_DATA_ERASER = Symbol('PERSONAL_DATA_ERASER');
export const QUEUE_INSPECTOR = Symbol('QUEUE_INSPECTOR');
export const PII_CIPHER = Symbol('PII_CIPHER');
export const CLOCK = Symbol('CLOCK');
export const ASSIGNMENT_POLICY = Symbol('ASSIGNMENT_POLICY');
/** Pausa antes de reencolar un `lead.anonymized.v1` fallido (ms). */
export const ANONYMIZE_RETRY_DELAY_MS = Symbol('ANONYMIZE_RETRY_DELAY_MS');
