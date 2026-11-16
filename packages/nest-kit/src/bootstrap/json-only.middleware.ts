import type { NextFunction, Request, Response } from 'express';
import { ProblemException } from '../errors/problem-exception';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);
const JSON_SUBTYPE = /^application\/[\w.+-]+\+json$/;

/** `true` si el `Content-Type` es JSON (`application/json` o `application/*+json`). */
export function isJsonContentType(header: string | undefined): boolean {
  if (!header) {
    return false;
  }
  const mediaType = header.split(';')[0]?.trim().toLowerCase() ?? '';
  return mediaType === 'application/json' || JSON_SUBTYPE.test(mediaType);
}

function hasBody(req: Request): boolean {
  if (req.headers['transfer-encoding'] !== undefined) {
    return true;
  }
  const length = req.headers['content-length'];
  return length !== undefined && Number(length) > 0;
}

/**
 * Middleware Express (C12): rechaza con 415 `UNSUPPORTED_MEDIA_TYPE` los
 * POST/PUT/PATCH con cuerpo cuyo `Content-Type` no es JSON. Las rutas que
 * empiezan por algún prefijo de `exemptPrefixes` quedan fuera (p. ej. webhooks).
 * El error pasa al `ProblemDetailsFilter` global.
 */
export function jsonOnlyMiddleware(exemptPrefixes: readonly string[] = []) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!METHODS_WITH_BODY.has(req.method) || !hasBody(req)) {
      next();
      return;
    }
    const path = req.path ?? req.url ?? '';
    if (exemptPrefixes.some((prefix) => path.startsWith(prefix))) {
      next();
      return;
    }
    if (isJsonContentType(req.headers['content-type'])) {
      next();
      return;
    }
    next(
      new ProblemException({
        status: 415,
        title: 'Tipo de contenido no soportado',
        code: 'UNSUPPORTED_MEDIA_TYPE',
        detail: 'Envía el cuerpo como application/json.',
      }),
    );
  };
}
