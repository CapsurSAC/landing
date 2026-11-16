import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureMethod = 'token' | 'hmac';
/** Qué secreto validó: el vigente o el anterior (rotación, C7). */
export type SecretGeneration = 'current' | 'previous';

export interface VerificationInput {
  /** Query `?token=` de la URL del webhook. */
  token?: string | null;
  /** Cabecera `x-chatwoot-signature` (HMAC-SHA256 hex del cuerpo crudo). */
  signature?: string | null;
  rawBody: Buffer;
}

export interface VerificationResult {
  method: SignatureMethod;
  secret: SecretGeneration;
}

/**
 * Verificación de autenticidad de los webhooks. Chatwoot nativo NO firma sus webhooks, por
 * eso se admiten dos vías:
 * (a) token secreto en la query de la URL configurada en Chatwoot (`?token=...`);
 * (b) cabecera `x-chatwoot-signature` con HMAC-SHA256 del cuerpo crudo, para proxies o
 *     automatizaciones que sí firman.
 * Rotación sin corte (C7): se acepta también `CHATWOOT_WEBHOOK_SECRET_PREVIOUS` mientras
 * esté definido. Todas las comparaciones son en tiempo constante y se evalúan todos los
 * secretos (el tiempo no revela cuál coincidió).
 */
export class WebhookSignatureVerifier {
  private readonly secrets: ReadonlyArray<{ value: string; generation: SecretGeneration }>;

  constructor(current: string, previous?: string | null) {
    const secrets: Array<{ value: string; generation: SecretGeneration }> = [{ value: current, generation: 'current' }];
    if (previous && previous !== current) {
      secrets.push({ value: previous, generation: 'previous' });
    }
    this.secrets = secrets;
  }

  /** Devuelve el método y el secreto que validaron, o null si ninguno es válido. */
  verify(input: VerificationInput): VerificationResult | null {
    let result: VerificationResult | null = null;
    const signature = input.signature ? normalizeSignature(input.signature) : null;
    for (const secret of this.secrets) {
      const tokenOk = input.token ? constantTimeEquals(input.token, secret.value) : false;
      const hmacOk = signature ? constantTimeEquals(signature, sign(input.rawBody, secret.value)) : false;
      if (!result && (tokenOk || hmacOk)) {
        result = { method: tokenOk ? 'token' : 'hmac', secret: secret.generation };
      }
    }
    return result;
  }

  /** Firma de referencia con el secreto vigente (pruebas y configuración de proxies que firman). */
  sign(rawBody: Buffer): string {
    const current = this.secrets[0];
    return sign(rawBody, current ? current.value : '');
  }
}

function sign(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function normalizeSignature(value: string): string {
  return value.trim().replace(/^sha256=/i, '').toLowerCase();
}

/** Comparación en tiempo constante aunque las longitudes difieran (se comparan los hashes). */
export function constantTimeEquals(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a, 'utf8').digest();
  const hashB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(hashA, hashB) && a.length === b.length;
}
