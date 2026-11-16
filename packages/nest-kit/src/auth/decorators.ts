import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Clave de metadatos de {@link Public}. */
export const IS_PUBLIC_KEY = 'capsur:internal-auth:public';

/** Petición tras pasar por `InternalAuthGuard`. */
export interface InternalRequest extends Request {
  /** Llamador identificado por su token (`admin-web`, `leads-service`, `ops`…). */
  caller?: string;
  /** Persona que originó la acción (cabecera `x-actor`), o `null`. */
  actor?: string | null;
}

/**
 * Marca un controlador o handler como público: el guard de tokens internos no
 * lo exige (p. ej. `GET /internal/health`).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Parámetro con el llamador autenticado (`request.caller`), o `undefined` en rutas públicas. */
export const InternalCaller = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<InternalRequest>().caller,
);

/** Parámetro con el actor (`x-actor`) de la petición, o `null`. */
export const InternalActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null =>
    context.switchToHttp().getRequest<InternalRequest>().actor ?? null,
);
