import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de acceso al estado del lead (C18): `HMAC-SHA256(LEAD_TOKEN_SECRET, leadId)`
 * en base64url. Se devuelve al crear el lead y se envía en `x-lead-token`.
 * No se guarda en ninguna parte: se vuelve a calcular para verificarlo.
 */
export class LeadTokenSigner {
  constructor(private readonly secret: string) {
    if (secret.length < 16) {
      throw new Error('LEAD_TOKEN_SECRET debe tener al menos 16 caracteres');
    }
  }

  sign(leadId: string): string {
    return createHmac('sha256', this.secret).update(leadId, 'utf8').digest('base64url');
  }

  /** Comparación en tiempo constante; `false` si falta el token. */
  verify(leadId: string, token: string | null | undefined): boolean {
    if (!token) {
      return false;
    }
    const expected = Buffer.from(this.sign(leadId), 'utf8');
    const received = Buffer.from(token.trim(), 'utf8');
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
}
