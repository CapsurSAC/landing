/**
 * Error de integración con un sistema externo (Chatwoot, broker).
 * La clasificación decide la estrategia del consumidor:
 * - `retryable`: 5xx, 429, timeout, red, broker caído, Chatwoot sin configurar.
 * - `permanent`: 4xx distinto de 429 (datos rechazados, token inválido, recurso inexistente).
 */
export type IntegrationErrorKind = 'retryable' | 'permanent';

export type IntegrationOperation =
  | 'sync_contact'
  | 'link_conversation'
  | 'assign'
  | 'auto_reply'
  | 'followup'
  | 'feedback'
  | 'delete_contact';

export interface IntegrationErrorOptions {
  httpStatus?: number;
  code?: string;
  cause?: unknown;
}

export class IntegrationError extends Error {
  readonly kind: IntegrationErrorKind;
  readonly httpStatus: number | undefined;
  readonly code: string | undefined;

  constructor(message: string, kind: IntegrationErrorKind, options: IntegrationErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'IntegrationError';
    this.kind = kind;
    this.httpStatus = options.httpStatus;
    this.code = options.code;
  }

  get retryable(): boolean {
    return this.kind === 'retryable';
  }

  static retryable(message: string, options: IntegrationErrorOptions = {}): IntegrationError {
    return new IntegrationError(message, 'retryable', options);
  }

  static permanent(message: string, options: IntegrationErrorOptions = {}): IntegrationError {
    return new IntegrationError(message, 'permanent', options);
  }

  /** Clasifica una respuesta HTTP: 429 y 5xx se reintentan; el resto de 4xx es definitivo. */
  static fromHttpStatus(status: number, message: string, options: Omit<IntegrationErrorOptions, 'httpStatus'> = {}): IntegrationError {
    const retryable = status === 429 || status >= 500;
    return new IntegrationError(message, retryable ? 'retryable' : 'permanent', { ...options, httpStatus: status });
  }

  /**
   * Normaliza cualquier error desconocido. Los errores no clasificados se tratan como
   * reintentables: tras agotar los intentos terminan en la DLQ, donde se pueden revisar.
   */
  static classify(error: unknown): IntegrationError {
    if (error instanceof IntegrationError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new IntegrationError(message, 'retryable', { code: 'UNEXPECTED', cause: error });
  }
}
