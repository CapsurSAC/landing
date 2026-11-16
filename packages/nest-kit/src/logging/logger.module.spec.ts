import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import pino from 'pino';
import { buildLoggerParams, buildPinoOptions } from './logger.module';
import { REDACTED, REDACT_PATHS, redactDeep, scrubText } from './redaction';
import { resolveRequestId } from './request-id';

function captureLogger(): { logger: pino.Logger; lines: () => string } {
  let output = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = pino({ ...buildPinoOptions({ service: 'test-service', level: 'info' }) }, stream);
  return { logger, lines: () => output };
}

describe('redacción de logs (C26)', () => {
  const phone = '+51987654321';
  const email = 'ana.perez@example.com';
  const fullName = 'Ana Pérez Quispe';
  const documentNumber = '45678912';

  it('redacta teléfono, correo, nombre y documento a cualquier profundidad', () => {
    const { logger, lines } = captureLogger();
    logger.info({ phone, email, fullName }, 'raíz');
    logger.info({ lead: { phone, email, fullName, documentNumber } }, 'un nivel');
    logger.info({ event: { payload: { consumer: { phone_number: phone } } } }, 'consumer');
    logger.info({ envelope: { payload: { contact: { phone, email, fullName } } } }, 'tres niveles');
    logger.info({ req: { body: { fullName, phone, email, captchaToken: 'tok-123', consumer: { name: fullName } } } }, 'body');

    const output = lines();
    expect(output).not.toContain(phone);
    expect(output).not.toContain(email);
    expect(output).not.toContain(fullName);
    expect(output).not.toContain(documentNumber);
    expect(output).not.toContain('tok-123');
    expect(output).toContain(REDACTED);
    expect(output).toContain('"service":"test-service"');
  });

  it('redacta cabeceras sensibles de la petición', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer secreto-interno',
            cookie: 'sid=abc',
            'x-lead-token': 'lead-token-xyz',
            api_access_token: 'chatwoot-token',
            'user-agent': 'jest',
          },
        },
      },
      'petición',
    );
    const output = lines();
    for (const secret of ['secreto-interno', 'sid=abc', 'lead-token-xyz', 'chatwoot-token']) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('jest');
  });

  it('expone REDACT_PATHS con las rutas de la spec', () => {
    expect(REDACT_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-lead-token"]',
        'req.headers.api_access_token',
        'req.body.consumer',
        'req.body.captchaToken',
        '*.fullName',
        '*.phone',
        '*.email',
        '*.phone_number',
        '*.documentNumber',
      ]),
    );
  });

  it('redactDeep y scrubText limpian objetos y texto libre', () => {
    expect(redactDeep({ a: { email, ok: 1 } })).toEqual({ a: { email: REDACTED, ok: 1 } });
    expect(scrubText(`Contacto ${email} / ${phone} / 987654321`)).toBe(`Contacto ${REDACTED} / ${REDACTED} / ${REDACTED}`);
  });
});

describe('buildLoggerParams', () => {
  it('usa destino asíncrono en producción', () => {
    const params = buildLoggerParams({ service: 's', nodeEnv: 'production' });
    expect(Array.isArray(params.pinoHttp)).toBe(true);
  });

  it('en pruebas queda en silencio y sin transporte', () => {
    const params = buildLoggerParams({ service: 's', nodeEnv: 'test' });
    expect(params.pinoHttp).toMatchObject({ level: 'silent' });
    expect(params.pinoHttp).not.toHaveProperty('transport');
  });

  it('en desarrollo usa pino-pretty', () => {
    const params = buildLoggerParams({ service: 's', nodeEnv: 'development' });
    expect(params.pinoHttp).toHaveProperty('transport.target', expect.stringContaining('pino-pretty'));
  });
});

describe('resolveRequestId', () => {
  function fakeReqRes(header?: string): { req: IncomingMessage; res: ServerResponse; headers: Record<string, string> } {
    const headers: Record<string, string> = {};
    const req = { headers: header === undefined ? {} : { 'x-request-id': header } } as unknown as IncomingMessage;
    const res = {
      headersSent: false,
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as ServerResponse;
    return { req, res, headers };
  }

  it('respeta un x-request-id válido y lo devuelve', () => {
    const { req, res, headers } = fakeReqRes('abc-123');
    expect(resolveRequestId(req, res)).toBe('abc-123');
    expect(headers['x-request-id']).toBe('abc-123');
  });

  it('genera uno nuevo si el entrante no es válido', () => {
    const { req, res, headers } = fakeReqRes('inyección\n{"x":1}');
    const id = resolveRequestId(req, res);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-request-id']).toBe(id);
  });
});
