import { ProblemException } from '../errors/problem-exception';
import { TurnstileVerifier, type FetchLike } from './turnstile-verifier';
import { assertAllowedUrl, isAllowedUrl, UrlNotAllowedError } from './url-allowlist';

function fakeFetch(
  respond: (body: URLSearchParams) => { ok: boolean; status: number; json: unknown } | Promise<never>,
): FetchLike & { calls: URLSearchParams[] } {
  const calls: URLSearchParams[] = [];
  const fn: FetchLike = async (_input, init) => {
    calls.push(init.body);
    const result = await respond(init.body);
    return { ok: result.ok, status: result.status, json: async () => result.json };
  };
  return Object.assign(fn, { calls });
}

describe('TurnstileVerifier (C3)', () => {
  it('sin secreto devuelve skipped sin llamar a Cloudflare', async () => {
    const fetch = fakeFetch(() => ({ ok: true, status: 200, json: { success: true } }));
    const verifier = new TurnstileVerifier({ secret: '', fetch });
    expect(await verifier.verify('token')).toEqual({ status: 'skipped', errorCodes: [] });
    expect(fetch.calls).toHaveLength(0);
  });

  it('ok con token válido y envía secret, response y remoteip', async () => {
    const fetch = fakeFetch(() => ({ ok: true, status: 200, json: { success: true, 'error-codes': [] } }));
    const verifier = new TurnstileVerifier({ secret: 's3cr3t', fetch });
    expect((await verifier.verify('tok', '203.0.113.7')).status).toBe('ok');
    const sent = fetch.calls[0];
    expect(sent?.get('secret')).toBe('s3cr3t');
    expect(sent?.get('response')).toBe('tok');
    expect(sent?.get('remoteip')).toBe('203.0.113.7');
  });

  it('invalid con token rechazado o vacío', async () => {
    const fetch = fakeFetch(() => ({ ok: true, status: 200, json: { success: false, 'error-codes': ['invalid-input-response'] } }));
    const verifier = new TurnstileVerifier({ secret: 's', fetch });
    expect(await verifier.verify('malo')).toEqual({ status: 'invalid', errorCodes: ['invalid-input-response'] });
    expect((await verifier.verify('')).status).toBe('invalid');
    expect(fetch.calls).toHaveLength(1);
  });

  it('unavailable ante error de red, 5xx o internal-error', async () => {
    const network = new TurnstileVerifier({ secret: 's', fetch: fakeFetch(() => Promise.reject(new Error('ECONNRESET'))) });
    expect((await network.verify('t')).status).toBe('unavailable');
    const http = new TurnstileVerifier({ secret: 's', fetch: fakeFetch(() => ({ ok: false, status: 502, json: null })) });
    expect((await http.verify('t')).status).toBe('unavailable');
    const internal = new TurnstileVerifier({
      secret: 's',
      fetch: fakeFetch(() => ({ ok: true, status: 200, json: { success: false, 'error-codes': ['internal-error'] } })),
    });
    expect((await internal.verify('t')).status).toBe('unavailable');
  });

  it('respeta el timeout de 3 s (aquí 50 ms)', async () => {
    const hanging: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    const verifier = new TurnstileVerifier({ secret: 's', fetch: hanging, timeoutMs: 50 });
    const started = Date.now();
    expect((await verifier.verify('t')).status).toBe('unavailable');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('verifyOrThrow lanza 400 CAPTCHA_INVALID o 503 CAPTCHA_UNAVAILABLE', async () => {
    const invalid = new TurnstileVerifier({ secret: 's', fetch: fakeFetch(() => ({ ok: true, status: 200, json: { success: false } })) });
    await expect(invalid.verifyOrThrow('t')).rejects.toMatchObject({ code: 'CAPTCHA_INVALID', status: 400 });
    const down = new TurnstileVerifier({ secret: 's', fetch: fakeFetch(() => ({ ok: false, status: 500, json: null })) });
    const error = await down.verifyOrThrow('t').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProblemException);
    expect((error as ProblemException).code).toBe('CAPTCHA_UNAVAILABLE');
    expect((error as ProblemException).getStatus()).toBe(503);
  });
});

describe('assertAllowedUrl (C20)', () => {
  const allowlist = 'chatwoot.example.com, *.capsur.pe, localhost:3000';

  it('acepta hosts exactos, subdominios comodín y host:puerto', () => {
    expect(assertAllowedUrl('https://chatwoot.example.com/api', allowlist).hostname).toBe('chatwoot.example.com');
    expect(isAllowedUrl('https://crm.capsur.pe', allowlist)).toBe(true);
    expect(isAllowedUrl('http://localhost:3000', allowlist)).toBe(true);
  });

  it('rechaza hosts fuera de la lista y trucos habituales de SSRF', () => {
    for (const url of [
      'https://evil.com',
      'https://chatwoot.example.com.evil.com',
      'https://capsur.pe',
      'http://localhost:6379',
      'http://169.254.169.254/latest/meta-data',
      'https://user:pass@chatwoot.example.com',
      'file:///etc/passwd',
      'no es una url',
    ]) {
      expect(() => assertAllowedUrl(url, allowlist)).toThrow(UrlNotAllowedError);
    }
  });

  it('exige https si se pide y una lista vacía no permite nada', () => {
    expect(() => assertAllowedUrl('http://chatwoot.example.com', allowlist, { requireHttps: true })).toThrow(/https/);
    expect(isAllowedUrl('https://chatwoot.example.com', '')).toBe(false);
  });
});
