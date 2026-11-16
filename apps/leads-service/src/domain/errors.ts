/**
 * Errores de dominio. No dependen de Nest ni de HTTP; `src/presentation/http/domain-errors.ts`
 * los traduce a problem-details con `registerDomainErrors` de `@capsur/nest-kit`.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** El teléfono no es válido para el país indicado. */
export class InvalidPhoneNumberError extends DomainError {
  readonly code = 'INVALID_PHONE';
  readonly path = 'phone';

  constructor(message = 'Escribe un número de WhatsApp válido (en Perú son 9 dígitos y empieza con 9)') {
    super(message);
  }
}

/** Las especialidades elegidas no son válidas para la promoción (A3). */
export class InvalidSpecialtiesError extends DomainError {
  readonly code = 'INVALID_SPECIALTIES';
  readonly path = 'specialtyIds';

  constructor(message: string) {
    super(message);
  }
}

/** La promoción no existe, es de otra marca o está inactiva. */
export class PromotionNotAvailableError extends DomainError {
  readonly code = 'PROMOTION_NOT_AVAILABLE';

  constructor(readonly promotionId: string) {
    super('Esta promoción ya no está disponible. Elige otra.');
  }
}

/** No se pudo consultar el catálogo de promociones y no hay caché. */
export class CatalogUnavailableError extends DomainError {
  readonly code = 'CATALOG_UNAVAILABLE';
  readonly retryAfterSeconds = 5;

  constructor(cause?: unknown) {
    super('No pudimos validar la promoción en este momento. Inténtalo de nuevo en unos segundos.');
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/** Mismo Idempotency-Key (y misma IP) con un cuerpo distinto. */
export class IdempotencyKeyReusedError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';

  constructor() {
    super('La clave de idempotencia ya se usó con una solicitud diferente.');
  }
}

/** Límite por teléfono (C2): demasiados registros del mismo número en la ventana. */
export class TooManyRequestsError extends DomainError {
  readonly code = 'RATE_LIMITED';

  constructor(readonly retryAfterSeconds: number) {
    super('Has enviado demasiadas solicitudes en poco tiempo. Espera un momento e inténtalo de nuevo.');
  }
}

/** El token de Turnstile falta o Cloudflare lo rechazó (C3). */
export class CaptchaInvalidError extends DomainError {
  readonly code = 'CAPTCHA_INVALID';

  constructor() {
    super('No pudimos verificar que no eres un robot. Vuelve a intentarlo.');
  }
}

/** Cloudflare no respondió a tiempo (C3). */
export class CaptchaUnavailableError extends DomainError {
  readonly code = 'CAPTCHA_UNAVAILABLE';
  readonly retryAfterSeconds = 5;

  constructor() {
    super('No pudimos verificar el captcha en este momento. Inténtalo de nuevo en unos segundos.');
  }
}

/**
 * Lead inexistente o token de estado ausente/incorrecto: la respuesta es la
 * misma en ambos casos para no revelar si un id existe (C18).
 */
export class LeadNotFoundError extends DomainError {
  readonly code = 'LEAD_NOT_FOUND';

  constructor(readonly leadId: string) {
    super('No encontramos la solicitud indicada.');
  }
}

/** La encuesta de origen ya se respondió para este lead (A21). */
export class FeedbackAlreadySubmittedError extends DomainError {
  readonly code = 'FEEDBACK_ALREADY_SUBMITTED';

  constructor() {
    super('Ya registramos tu respuesta. ¡Gracias!');
  }
}

export class ComplaintNotFoundError extends DomainError {
  readonly code = 'COMPLAINT_NOT_FOUND';

  constructor(readonly complaintId: string) {
    super('No encontramos el reclamo indicado.');
  }
}

export class PrivacyRequestNotFoundError extends DomainError {
  readonly code = 'PRIVACY_REQUEST_NOT_FOUND';

  constructor(readonly requestId: string) {
    super('No encontramos la solicitud ARCO indicada.');
  }
}

/** Transición de estado no permitida por la máquina de estados del lead. */
export class InvalidStateTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Transición de estado no permitida: ${from} -> ${to}`);
  }
}

/** Colisión de clave única al generar la referencia corta; el caso de uso reintenta. */
export class ReferenceCollisionError extends DomainError {
  readonly code = 'REFERENCE_COLLISION';

  constructor(readonly reference: string) {
    super(`La referencia ${reference} ya existe`);
  }
}

/** Un evento entrante no cumple su esquema; se descarta sin reintentar. */
export class InvalidEventPayloadError extends DomainError {
  readonly code = 'INVALID_EVENT_PAYLOAD';

  constructor(
    readonly eventName: string,
    detail: string,
  ) {
    super(`Payload inválido para ${eventName}: ${detail}`);
  }
}
