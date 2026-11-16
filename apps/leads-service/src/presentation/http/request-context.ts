import { hashIp } from '@capsur/nest-kit';
import type { Request } from 'express';
import type { LeadClientContext } from '../../application/use-cases/create-lead';

const MAX_USER_AGENT_LENGTH = 512;

/** IP del cliente (respeta `trust proxy` = 1: la toma de X-Forwarded-For del gateway). */
export function clientIp(request: Request): string | null {
  return request.ip ?? request.socket?.remoteAddress ?? null;
}

/** IP hasheada con pimienta (`sha256(ip + pepper)`); nunca se guarda en claro. */
export function clientIpHash(request: Request, pepper: string): string | null {
  const ip = clientIp(request);
  return ip ? hashIp(ip, pepper) : null;
}

export function userAgentOf(request: Request): string | null {
  const header = request.get('user-agent');
  return header ? header.slice(0, MAX_USER_AGENT_LENGTH) : null;
}

/** Lee una cookie de la cabecera `Cookie` sin dependencias (solo `_fbc`/`_fbp`). */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      const raw = part.slice(separator + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/** Cabecera de un solo valor (la primera si viene repetida). */
export function headerOf(request: Request, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Datos técnicos para Meta Conversions API (A17): IP, user agent, cookies
 * `_fbc`/`_fbp` y la URL de origen (`referer`). El caso de uso solo los pone
 * en el evento si hay consentimiento de publicidad.
 */
export function leadClientContext(request: Request): LeadClientContext {
  return {
    ipAddress: clientIp(request),
    userAgent: userAgentOf(request),
    fbc: readCookie(request, '_fbc'),
    fbp: readCookie(request, '_fbp'),
    eventSourceUrl: headerOf(request, 'referer') ?? null,
  };
}
