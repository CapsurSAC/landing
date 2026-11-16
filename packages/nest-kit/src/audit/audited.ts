import {
  applyDecorators,
  Inject,
  Injectable,
  SetMetadata,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { from, mergeMap, type Observable } from 'rxjs';
import type { InternalRequest } from '../auth/decorators';
import { AuditService } from './audit.service';

/** Clave de metadatos de {@link Audited}. */
export const AUDIT_METADATA_KEY = 'capsur:audit';

/** Opciones de {@link Audited}. */
export interface AuditedOptions {
  /**
   * Qué se guarda como `target`: nombre de un parámetro de ruta (`'leadId'`)
   * o función sobre la petición. Por defecto, el primer parámetro de ruta.
   */
  target?: string | ((request: InternalRequest) => string | null | undefined);
}

interface AuditMetadata {
  action: string;
  options: AuditedOptions;
}

/**
 * Registra la acción en auditoría cuando el handler termina con éxito:
 * llamador, actor, método, ruta, parámetros de ruta y status (nunca el cuerpo).
 * Requiere `AuditModule` (global) en el servicio.
 *
 * @example
 * @Post(':leadId/anonymize')
 * @Audited('lead.anonymize', { target: 'leadId' })
 * anonymize(...) {}
 */
export function Audited(action: string, options: AuditedOptions = {}): MethodDecorator & ClassDecorator {
  const metadata: AuditMetadata = { action, options };
  return applyDecorators(SetMetadata(AUDIT_METADATA_KEY, metadata), UseInterceptors(AuditInterceptor));
}

function resolveTarget(request: InternalRequest, options: AuditedOptions): string | null {
  const params = (request.params ?? {}) as Record<string, string | undefined>;
  if (typeof options.target === 'function') {
    return options.target(request) ?? null;
  }
  if (typeof options.target === 'string') {
    return params[options.target] ?? null;
  }
  const first = Object.values(params).find((value) => typeof value === 'string' && value !== '');
  return first ?? null;
}

/** Interceptor que aplica {@link Audited}. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!metadata || context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<InternalRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      mergeMap((result: unknown) =>
        from(
          this.audit
            .record({
              caller: request.caller ?? 'unknown',
              actor: request.actor ?? null,
              action: metadata.action,
              target: resolveTarget(request, metadata.options),
              metadata: {
                method: request.method,
                route: request.route && typeof request.route.path === 'string' ? request.route.path : request.path,
                params: { ...(request.params ?? {}) },
                status: response.statusCode,
              },
            })
            .then(() => result),
        ),
      ),
    );
  }
}
