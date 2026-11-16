import { createHmac } from 'node:crypto';
import { constantTimeEquals, WebhookSignatureVerifier } from './webhook-signature-verifier';

const SECRET = 's3cr3t-webhook';
const PREVIOUS = 'secreto-anterior';
const body = Buffer.from(JSON.stringify({ event: 'message_created', id: 1 }), 'utf8');
const hmac = (secret: string, raw: Buffer = body): string => createHmac('sha256', secret).update(raw).digest('hex');

describe('WebhookSignatureVerifier', () => {
  const verifier = new WebhookSignatureVerifier(SECRET);

  it('acepta el token de la query cuando coincide con el secreto', () => {
    expect(verifier.verify({ token: SECRET, rawBody: body })).toEqual({ method: 'token', secret: 'current' });
  });

  it('rechaza un token distinto, vacío o ausente', () => {
    expect(verifier.verify({ token: 's3cr3t-webhooK', rawBody: body })).toBeNull();
    expect(verifier.verify({ token: '', rawBody: body })).toBeNull();
    expect(verifier.verify({ rawBody: body })).toBeNull();
  });

  it('acepta una firma HMAC-SHA256 válida del cuerpo crudo (con o sin prefijo sha256=)', () => {
    const signature = hmac(SECRET);

    expect(verifier.verify({ signature, rawBody: body })).toEqual({ method: 'hmac', secret: 'current' });
    expect(verifier.verify({ signature: `sha256=${signature.toUpperCase()}`, rawBody: body })).toEqual({ method: 'hmac', secret: 'current' });
    expect(verifier.sign(body)).toBe(signature);
  });

  it('rechaza una firma sobre otro cuerpo o con otro secreto', () => {
    expect(verifier.verify({ signature: hmac(SECRET, Buffer.from('{}')), rawBody: body })).toBeNull();
    expect(verifier.verify({ signature: hmac('otro'), rawBody: body })).toBeNull();
    expect(verifier.verify({ signature: 'no-hex', rawBody: body })).toBeNull();
  });

  it('si el token falla, prueba la firma', () => {
    expect(verifier.verify({ token: 'malo', signature: hmac(SECRET), rawBody: body })).toEqual({ method: 'hmac', secret: 'current' });
  });

  describe('rotación del secreto (C7)', () => {
    const rotating = new WebhookSignatureVerifier(SECRET, PREVIOUS);

    it('acepta el token y la firma del secreto anterior e indica que es el anterior', () => {
      expect(rotating.verify({ token: PREVIOUS, rawBody: body })).toEqual({ method: 'token', secret: 'previous' });
      expect(rotating.verify({ signature: hmac(PREVIOUS), rawBody: body })).toEqual({ method: 'hmac', secret: 'previous' });
    });

    it('el secreto vigente sigue funcionando y tiene prioridad', () => {
      expect(rotating.verify({ token: SECRET, rawBody: body })).toEqual({ method: 'token', secret: 'current' });
      expect(rotating.verify({ token: PREVIOUS, signature: hmac(SECRET), rawBody: body })).toEqual({ method: 'hmac', secret: 'current' });
    });

    it('sin secreto anterior configurado, el antiguo deja de valer', () => {
      expect(verifier.verify({ token: PREVIOUS, rawBody: body })).toBeNull();
      expect(new WebhookSignatureVerifier(SECRET, '').verify({ token: '', rawBody: body })).toBeNull();
    });

    it('firma siempre con el secreto vigente', () => {
      expect(rotating.sign(body)).toBe(hmac(SECRET));
    });
  });
});

describe('constantTimeEquals', () => {
  it('compara cadenas iguales y distintas sin lanzar aunque difieran en longitud', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });

  it('usa timingSafeEqual sobre digests de longitud fija', () => {
    const crypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
    const spy = jest.spyOn(crypto, 'timingSafeEqual');

    constantTimeEquals('corto', 'una-cadena-mucho-mas-larga');

    expect(spy).toHaveBeenCalledTimes(1);
    const [left, right] = spy.mock.calls[0]!;
    expect(Buffer.byteLength(left as Buffer)).toBe(32);
    expect(Buffer.byteLength(right as Buffer)).toBe(32);
    spy.mockRestore();
  });
});
