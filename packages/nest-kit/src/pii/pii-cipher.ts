import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Error al descifrar: formato inválido, clave distinta o texto manipulado. */
export class PiiDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PiiDecryptionError';
  }
}

/** Decodifica una clave base64 (o base64url) y exige exactamente 32 bytes. */
export function decodeKey32(keyBase64: string | Buffer, name = 'PII_ENCRYPTION_KEY'): Buffer {
  const key = typeof keyBase64 === 'string' ? Buffer.from(keyBase64.trim(), 'base64') : Buffer.from(keyBase64);
  if (key.length !== KEY_BYTES) {
    throw new Error(`${name} debe ser una clave de 32 bytes codificada en base64 (se recibieron ${key.length} bytes)`);
  }
  return key;
}

/**
 * Cifrado de datos personales en reposo (C8) con AES-256-GCM.
 * Formato: `v1.<iv>.<tag>.<ciphertext>` en base64url, con IV aleatorio de
 * 12 bytes en cada llamada (dos cifrados del mismo texto nunca coinciden).
 *
 * @example
 * const cipher = new PiiCipher(env.PII_ENCRYPTION_KEY);
 * const stored = cipher.encrypt('+51987654321');
 * cipher.decrypt(stored); // '+51987654321'
 */
export class PiiCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string | Buffer) {
    this.key = decodeKey32(keyBase64);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt(payload: string): string {
    const parts = payload.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new PiiDecryptionError('Formato de dato cifrado no reconocido');
    }
    const [, ivPart = '', tagPart = '', dataPart = ''] = parts;
    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    const data = Buffer.from(dataPart, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new PiiDecryptionError('Dato cifrado con IV o etiqueta de longitud inválida');
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      throw new PiiDecryptionError('No se pudo descifrar: clave incorrecta o dato manipulado');
    }
  }

  /** Cifra cualquier valor serializable a JSON. */
  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  /** Descifra y parsea JSON. El tipo no se valida: valida con Zod si el origen no es de confianza. */
  decryptJson<T = unknown>(payload: string): T {
    return JSON.parse(this.decrypt(payload)) as T;
  }

  /** `true` si el texto tiene el formato de un valor cifrado por esta clase. */
  static isEncrypted(value: string): boolean {
    return /^v1\.[\w-]+\.[\w-]+\.[\w-]*$/.test(value);
  }
}

/**
 * Decodifica una clave HMAC en base64 y exige al menos 32 bytes (HMAC admite
 * cualquier longitud; la clave de desarrollo de la spec mide 34 bytes).
 */
export function decodeHmacKey(keyBase64: string | Buffer, name = 'PII_HASH_KEY'): Buffer {
  const key = typeof keyBase64 === 'string' ? Buffer.from(keyBase64.trim(), 'base64') : Buffer.from(keyBase64);
  if (key.length < KEY_BYTES) {
    throw new Error(`${name} debe ser una clave de al menos 32 bytes codificada en base64 (se recibieron ${key.length} bytes)`);
  }
  return key;
}

/**
 * HMAC-SHA256 en hex con una clave en base64 de al menos 32 bytes
 * (`PII_HASH_KEY`). Para duplicados y búsquedas sin guardar el dato en claro.
 * Normaliza el valor antes de llamar (p. ej. E.164, correo en minúsculas).
 */
export function hmacHash(value: string, keyBase64: string | Buffer): string {
  return createHmac('sha256', decodeHmacKey(keyBase64)).update(value, 'utf8').digest('hex');
}

/**
 * Hash de IP con pimienta: `sha256(ip + pepper)` en hex. Mantiene el formato
 * que ya usa leads-service para no invalidar los hashes guardados.
 */
export function hashIp(ip: string, pepper: string): string {
  return createHash('sha256').update(`${ip}${pepper}`).digest('hex');
}
