import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACTOR_HEADER } from '@capsur/api-contracts';
import { ProblemException } from '../errors/problem-exception';
import { IS_PUBLIC_KEY, type InternalRequest } from './decorators';
import { InternalTokenVerifier } from './internal-token-verifier';

const MAX_ACTOR_LENGTH = 254;
// Solo caracteres imprimibles (sin controles): el actor acaba en logs y en `audit_log`.
const ACTOR_PATTERN = /^[^\p{Cc}]+$/u;

/** Normaliza la cabecera `x-actor`: texto imprimible de hasta 254 caracteres, o `null`. */
export function readActor(header: string | string[] | undefined): string | null {
  const value = (Array.isArray(header) ? header[0] : header)?.trim();
  if (!value || value.length > MAX_ACTOR_LENGTH || !ACTOR_PATTERN.test(value)) {
    return null;
  }
  return value;
}

/** Problem-details 401 que devuelve el guard (idéntico en todos los servicios). */
export function unauthorizedProblem(): ProblemException {
  return new ProblemException({
    status: 401,
    title: 'No autorizado',
    code: 'UNAUTHORIZED',
    detail: 'Token de servicio ausente o inválido.',
    headers: { 'WWW-Authenticate': 'Bearer' },
  });
}

/**
 * Exige `Authorization: Bearer <token>` de un llamador de
 * `INTERNAL_API_TOKENS`. Deja `request.caller` y `request.actor` (cabecera
 * `x-actor`). Respeta `@Public()`.
 *
 * Uso explícito: `@UseGuards(InternalAuthGuard)`. Para proteger todas las
 * rutas `/internal/*` de forma global, `InternalAuthModule.forRoot` registra
 * {@link InternalPathsAuthGuard}.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(
    @Inject(InternalTokenVerifier) private readonly verifier: InternalTokenVerifier,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<InternalRequest>();
    if (!this.appliesTo(request)) {
      return true;
    }
    const caller = this.verifier.identifyAuthorization(request.headers.authorization);
    if (!caller) {
      throw unauthorizedProblem();
    }
    request.caller = caller;
    request.actor = readActor(request.headers[ACTOR_HEADER]);
    return true;
  }

  /** Indica si la petición debe autenticarse. La versión base protege todo. */
  protected appliesTo(_request: InternalRequest): boolean {
    return true;
  }
}

/** Variante global: solo exige token en rutas que empiezan por `/internal/`. */
@Injectable()
export class InternalPathsAuthGuard extends InternalAuthGuard {
  protected override appliesTo(request: InternalRequest): boolean {
    const path = request.path ?? request.url ?? '';
    return path === '/internal' || path.startsWith('/internal/');
  }
}
