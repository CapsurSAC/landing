import {
  Catch,
  HttpException,
  Inject,
  Injectable,
  Logger,
  Optional,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { reportServerError } from '../sentry/error-reporter';
import { DomainErrorRegistry, defaultDomainErrorRegistry, type DomainErrorMapping } from './domain-error-registry';
import { ProblemException, type FieldError, type ProblemDetailsBody } from './problem-exception';

/** Token opcional para inyectar un {@link DomainErrorRegistry} propio en el filtro. */
export const DOMAIN_ERROR_REGISTRY = Symbol('DOMAIN_ERROR_REGISTRY');

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const TITLES: Readonly<Record<number, string>> = {
  400: 'Solicitud inválida',
  401: 'No autorizado',
  403: 'Prohibido',
  404: 'Recurso no encontrado',
  405: 'Método no permitido',
  409: 'Conflicto',
  413: 'Cuerpo demasiado grande',
  415: 'Tipo de contenido no soportado',
  422: 'Entidad no procesable',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
  502: 'Dependencia no disponible',
  503: 'Servicio no disponible',
  504: 'Tiempo de espera agotado',
};

const CODES: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

/** Título por defecto para un código HTTP. */
export function defaultProblemTitle(status: number): string {
  return TITLES[status] ?? (status >= 500 ? 'Error interno' : 'Error en la solicitud');
}

/** Código de máquina por defecto para un código HTTP. */
export function defaultProblemCode(status: number): string {
  return CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
}

interface Resolved {
  body: ProblemDetailsBody;
  headers: Record<string, string>;
}

type RequestWithId = Request & { id?: unknown };

/**
 * Filtro global: toda excepción sale como problem-details
 * (`application/problem+json`) con `traceId` = id de la petición (`req.id`
 * que asigna pino-http a partir de `x-request-id`).
 *
 * - `ProblemException` / `ValidationException` → tal cual.
 * - Errores de dominio registrados con `registerDomainErrors` → su mapeo.
 * - `ThrottlerException` → 429 `RATE_LIMITED`.
 * - Cuerpo demasiado grande (body-parser o `PayloadTooLargeException`) → 413 `PAYLOAD_TOO_LARGE`.
 * - 415 → `UNSUPPORTED_MEDIA_TYPE`.
 * - Cualquier otro error → 500 `INTERNAL_ERROR` (se loguea sin datos personales y se reporta a Sentry).
 *
 * Registro: `app.useGlobalFilters(new ProblemDetailsFilter())` o
 * `{ provide: APP_FILTER, useClass: ProblemDetailsFilter }`.
 */
@Catch()
@Injectable()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetailsFilter');
  private readonly registry: DomainErrorRegistry;

  constructor(@Optional() @Inject(DOMAIN_ERROR_REGISTRY) registry?: DomainErrorRegistry) {
    this.registry = registry ?? defaultDomainErrorRegistry;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithId>();

    const { body, headers } = this.resolve(exception);
    const traceId = resolveTraceId(request);
    if (traceId) {
      body.traceId = traceId;
    }

    // La ruta se registra sin query string: puede contener filtros con datos personales.
    const path = request.route && typeof request.route.path === 'string' ? request.route.path : request.path;
    if (body.status >= 500) {
      this.logger.error(
        {
          status: body.status,
          code: body.code,
          traceId,
          method: request.method,
          path,
          err: describeError(exception),
        },
        'Error no controlado en la petición',
      );
      reportServerError(exception, { traceId, method: request.method, path, status: body.status });
    } else if (body.status !== 404) {
      this.logger.warn({ status: body.status, code: body.code, traceId, method: request.method, path }, body.title);
    }

    if (response.headersSent) {
      return;
    }
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }
    response.status(body.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(body));
  }

  /** Traduce cualquier excepción a cuerpo + cabeceras. Público para pruebas. */
  resolve(exception: unknown): Resolved {
    if (exception instanceof ProblemException) {
      return { body: exception.toBody(), headers: { ...exception.headers } };
    }

    const mapping = this.registry.resolve(exception);
    if (mapping && exception instanceof Error) {
      return fromMapping(exception, mapping);
    }

    if (exception instanceof ThrottlerException) {
      return problem(
        429,
        'RATE_LIMITED',
        'Has enviado demasiadas solicitudes en poco tiempo. Espera un momento e inténtalo de nuevo.',
      );
    }

    if (exception instanceof HttpException) {
      return fromHttpException(exception);
    }

    const external = fromExternalHttpError(exception);
    if (external) {
      return external;
    }

    return problem(500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado. Inténtalo de nuevo.');
  }
}

function problem(
  status: number,
  code: string,
  detail?: string,
  extra: { title?: string; errors?: FieldError[]; headers?: Record<string, string> } = {},
): Resolved {
  const body: ProblemDetailsBody = { type: 'about:blank', title: extra.title ?? defaultProblemTitle(status), status, code };
  if (detail !== undefined && detail !== '') {
    body.detail = detail;
  }
  if (extra.errors && extra.errors.length > 0) {
    body.errors = extra.errors;
  }
  return { body, headers: extra.headers ?? {} };
}

function fromMapping(error: Error, mapping: DomainErrorMapping): Resolved {
  const ownCode = (error as { code?: unknown }).code;
  const code =
    (typeof mapping.code === 'function' ? mapping.code(error) : mapping.code) ??
    (typeof ownCode === 'string' ? ownCode : undefined) ??
    defaultProblemCode(mapping.status);
  const detail =
    mapping.detail === null
      ? undefined
      : typeof mapping.detail === 'function'
        ? mapping.detail(error)
        : (mapping.detail ?? (mapping.status >= 500 ? undefined : error.message));
  const extra: { title?: string; errors?: FieldError[]; headers?: Record<string, string> } = {};
  if (mapping.title !== undefined) {
    extra.title = mapping.title;
  }
  if (mapping.errors) {
    extra.errors = mapping.errors(error);
  }
  if (mapping.headers) {
    extra.headers = mapping.headers(error);
  }
  return problem(mapping.status, code, detail, extra);
}

function fromHttpException(exception: HttpException): Resolved {
  const status = exception.getStatus();
  const raw = exception.getResponse();
  if (typeof raw === 'string') {
    return problem(status, defaultProblemCode(status), status >= 500 ? undefined : raw);
  }
  const record = isRecord(raw) ? raw : {};
  const code = typeof record.code === 'string' ? record.code : defaultProblemCode(status);
  const title = typeof record.title === 'string' ? record.title : undefined;
  const detail = status >= 500 ? undefined : (messageOf(record) ?? exception.message);
  const extra: { title?: string; errors?: FieldError[] } = {};
  if (title) {
    extra.title = title;
  }
  if (isFieldErrorList(record.errors)) {
    extra.errors = record.errors;
  }
  return problem(status, code, detail, extra);
}

/**
 * Errores HTTP que no son `HttpException` (p. ej. los de body-parser, creados
 * con `http-errors`): `entity.too.large` → 413, charset/encoding → 415.
 */
function fromExternalHttpError(exception: unknown): Resolved | null {
  if (!isRecord(exception)) {
    return null;
  }
  const type = typeof exception.type === 'string' ? exception.type : undefined;
  if (type === 'entity.too.large') {
    return problem(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la solicitud supera el tamaño permitido.');
  }
  if (type === 'charset.unsupported' || type === 'encoding.unsupported') {
    return problem(415, 'UNSUPPORTED_MEDIA_TYPE', 'Codificación del cuerpo no soportada.');
  }
  const status = typeof exception.status === 'number' ? exception.status : exception.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500 && exception.expose === true) {
    const message = typeof exception.message === 'string' ? exception.message : undefined;
    return problem(status, defaultProblemCode(status), message);
  }
  return null;
}

function messageOf(raw: Record<string, unknown>): string | undefined {
  const message = raw.message ?? raw.detail;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return message.map(String).join('; ');
  }
  return undefined;
}

function isFieldErrorList(value: unknown): value is FieldError[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isRecord(item) && typeof item.path === 'string' && typeof item.message === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveTraceId(request: RequestWithId): string | undefined {
  if (typeof request.id === 'string' || typeof request.id === 'number') {
    return String(request.id);
  }
  const header = request.headers?.['x-request-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && /^[\w.-]{1,128}$/.test(value) ? value : undefined;
}

/** Resumen del error apto para logs: nombre, mensaje y pila; sin propiedades arbitrarias. */
function describeError(error: unknown): { type: string; message: string; stack?: string } {
  if (error instanceof Error) {
    const described: { type: string; message: string; stack?: string } = { type: error.name, message: error.message };
    if (error.stack) {
      described.stack = error.stack;
    }
    return described;
  }
  return { type: typeof error, message: 'Valor lanzado que no es un Error' };
}
