import { PiiCipher, hmacHash } from '@capsur/nest-kit';
import type { PersonalDataHasher } from '../../application/ports/security';

/**
 * Cifrado y hash de datos personales para los repositorios (C8):
 * - `seal`/`open`: AES-256-GCM de `PiiCipher` (`v1.<iv>.<tag>.<ct>`);
 * - `hash`: HMAC-SHA256 hex con `PII_HASH_KEY` para duplicados y búsquedas.
 *
 * `open` tolera texto en claro heredado (filas anteriores a la migración que
 * aún no pasó el backfill): lo devuelve tal cual. Un valor con formato `v1.`
 * manipulado o cifrado con otra clave sí lanza `PiiDecryptionError`.
 */
export class PiiCodec implements PersonalDataHasher {
  private readonly cipher: PiiCipher;

  constructor(
    encryptionKeyBase64: string,
    private readonly hashKeyBase64: string,
  ) {
    this.cipher = new PiiCipher(encryptionKeyBase64);
    // Falla al arrancar si la clave HMAC no es válida, no en la primera petición.
    hmacHash('probe', hashKeyBase64);
  }

  seal(plaintext: string): string {
    return this.cipher.encrypt(plaintext);
  }

  sealNullable(plaintext: string | null): string | null {
    return plaintext === null ? null : this.seal(plaintext);
  }

  open(stored: string): string {
    return PiiCipher.isEncrypted(stored) ? this.cipher.decrypt(stored) : stored;
  }

  openNullable(stored: string | null): string | null {
    return stored === null ? null : this.open(stored);
  }

  sealJson(value: unknown): string {
    return this.cipher.encryptJson(value);
  }

  /** Descifra JSON (o parsea JSON heredado sin cifrar). El llamador valida el tipo con Zod. */
  openJson(stored: string): unknown {
    return JSON.parse(this.open(stored)) as unknown;
  }

  hash(normalizedValue: string): string {
    return hmacHash(normalizedValue, this.hashKeyBase64);
  }

  static isSealed(value: string): boolean {
    return PiiCipher.isEncrypted(value);
  }
}

export const PII_CODEC = Symbol('PII_CODEC');
