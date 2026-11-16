import { HttpException } from '@nestjs/common';

/** Error de validación de un campo concreto (`path` con notación de puntos). */
export interface FieldError {
  path: string;
  message: string;
}

/**
 * Cuerpo problem-details (RFC 9457 simplificado) que devuelven todos los
 * servicios. Coincide con `ApiErrorSchema` de `@capsur/api-contracts`.
 */
export interface ProblemDetailsBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: FieldError[];
  traceId?: string;
}

/** Opciones para construir un {@link ProblemException}. */
export interface ProblemOptions {
  /** Código HTTP (4xx/5xx). */
  status: number;
  /** Título corto y estable, legible por humanos. */
  title: string;
  /** Código de máquina en MAYÚSCULAS_CON_GUIONES_BAJOS (p. ej. `CAPTCHA_INVALID`). */
  code: string;
  /** Explicación para el usuario final; nunca debe incluir datos personales. */
  detail?: string;
  /** Errores por campo (solo validaciones). */
  errors?: FieldError[];
  /** Cabeceras extra de la respuesta, p. ej. `{ 'Retry-After': '30' }`. */
  headers?: Record<string, string>;
}

/**
 * Excepción HTTP con la forma exacta de problem-details. El
 * `ProblemDetailsFilter` la serializa tal cual como `application/problem+json`.
 *
 * @example
 * throw new ProblemException({ status: 503, title: 'Catálogo no disponible', code: 'CATALOG_UNAVAILABLE', headers: { 'Retry-After': '30' } });
 */
export class ProblemException extends HttpException {
  readonly code: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly errors: FieldError[] | undefined;
  readonly headers: Record<string, string>;

  constructor(options: ProblemOptions) {
    super(options.detail ?? options.title, options.status);
    this.name = 'ProblemException';
    this.code = options.code;
    this.title = options.title;
    this.detail = options.detail;
    this.errors = options.errors;
    this.headers = options.headers ?? {};
  }

  /** Cuerpo problem-details sin `traceId` (lo añade el filtro). */
  toBody(): ProblemDetailsBody {
    const body: ProblemDetailsBody = {
      type: 'about:blank',
      title: this.title,
      status: this.getStatus(),
      code: this.code,
    };
    if (this.detail !== undefined) {
      body.detail = this.detail;
    }
    if (this.errors !== undefined) {
      body.errors = this.errors;
    }
    return body;
  }
}

/** 400 con la lista de errores por campo (`code: VALIDATION_FAILED`). */
export class ValidationException extends ProblemException {
  constructor(errors: FieldError[], detail = 'Revisa los campos marcados.') {
    super({ status: 400, title: 'Solicitud inválida', code: 'VALIDATION_FAILED', detail, errors });
    this.name = 'ValidationException';
  }
}
