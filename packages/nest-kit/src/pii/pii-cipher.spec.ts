import { randomBytes } from 'node:crypto';
import { PiiCipher, PiiDecryptionError, hashIp, hmacHash } from './pii-cipher';

const DEV_KEY = 'ZGV2LW9ubHktcGlpLWtleS0zMi1ieXRlcy1sb25nISE=';
const DEV_HASH_KEY = 'ZGV2LW9ubHktaGFzaC1rZXktMzItYnl0ZXMtbG9uZyEhIQ==';

describe('PiiCipher (C8)', () => {
  const cipher = new PiiCipher(DEV_KEY);

  it('cifra y descifra (ida y vuelta) incluyendo caracteres no ASCII', () => {
    for (const value of ['+51987654321', 'ana.perez@example.com', 'Ñuñez Pérez', '']) {
      expect(cipher.decrypt(cipher.encrypt(value))).toBe(value);
    }
  });

  it('usa el formato v1.<iv>.<tag>.<ct> en base64url', () => {
    const encrypted = cipher.encrypt('hola');
    expect(encrypted).toMatch(/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/);
    expect(PiiCipher.isEncrypted(encrypted)).toBe(true);
    expect(PiiCipher.isEncrypted('+51987654321')).toBe(false);
  });

  it('usa un IV distinto en cada cifrado', () => {
    const a = cipher.encrypt('+51987654321');
    const b = cipher.encrypt('+51987654321');
    expect(a).not.toBe(b);
    expect(a.split('.')[1]).not.toBe(b.split('.')[1]);
  });

  it('detecta manipulación del texto cifrado, la etiqueta o el IV', () => {
    const [version, iv, tag, data] = cipher.encrypt('+51987654321').split('.') as [string, string, string, string];
    const flip = (part: string): string => {
      const bytes = Buffer.from(part, 'base64url');
      bytes[0] = (bytes[0] ?? 0) ^ 0xff;
      return bytes.toString('base64url');
    };
    expect(() => cipher.decrypt([version, iv, tag, flip(data)].join('.'))).toThrow(PiiDecryptionError);
    expect(() => cipher.decrypt([version, iv, flip(tag), data].join('.'))).toThrow(PiiDecryptionError);
    expect(() => cipher.decrypt([version, flip(iv), tag, data].join('.'))).toThrow(PiiDecryptionError);
    expect(() => cipher.decrypt(`v2.${iv}.${tag}.${data}`)).toThrow(PiiDecryptionError);
    expect(() => cipher.decrypt('texto plano')).toThrow(PiiDecryptionError);
  });

  it('no descifra con otra clave', () => {
    const other = new PiiCipher(randomBytes(32).toString('base64'));
    expect(() => other.decrypt(cipher.encrypt('secreto'))).toThrow(PiiDecryptionError);
  });

  it('cifra JSON', () => {
    const payload = { phone: '+51987654321', nested: { ok: true } };
    expect(cipher.decryptJson(cipher.encryptJson(payload))).toEqual(payload);
  });

  it('exige una clave de exactamente 32 bytes con un error claro', () => {
    expect(() => new PiiCipher(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes.*16 bytes/);
    expect(() => new PiiCipher(DEV_HASH_KEY)).toThrow(/34 bytes/);
  });
});

describe('hmacHash y hashIp', () => {
  it('hmacHash es determinista, hex de 64 y depende de la clave', () => {
    const a = hmacHash('+51987654321', DEV_HASH_KEY);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacHash('+51987654321', DEV_HASH_KEY)).toBe(a);
    expect(hmacHash('+51987654321', DEV_KEY)).not.toBe(a);
    expect(hmacHash('+51987654322', DEV_HASH_KEY)).not.toBe(a);
  });

  it('hmacHash rechaza claves de menos de 32 bytes', () => {
    expect(() => hmacHash('x', Buffer.alloc(8).toString('base64'))).toThrow(/al menos 32 bytes/);
  });

  it('hashIp mantiene el formato sha256(ip + pepper) de leads-service', () => {
    expect(hashIp('203.0.113.7', 'pepper-de-prueba-123')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp('203.0.113.7', 'pepper-de-prueba-123')).not.toBe(hashIp('203.0.113.8', 'pepper-de-prueba-123'));
  });
});
