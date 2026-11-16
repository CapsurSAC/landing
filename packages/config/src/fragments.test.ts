import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { withEnvContext } from './context';
import {
  base64Key32Schema,
  base64KeyMin32Schema,
  booleanFlagSchema,
  corsOriginsSchema,
  csvSchema,
  databaseUrlSchema,
  internalTokensSchema,
  jsonSchema,
  logLevelSchema,
  nodeEnvSchema,
  portSchema,
  rabbitUrlSchema,
  redisUrlSchema,
} from './fragments';

const PII_ENCRYPTION_KEY = 'ZGV2LW9ubHktcGlpLWtleS0zMi1ieXRlcy1sb25nISE=';
const PII_HASH_KEY = 'ZGV2LW9ubHktaGFzaC1rZXktMzItYnl0ZXMtbG9uZyEhIQ==';

describe('fragmentos básicos', () => {
  it('portSchema convierte y acota', () => {
    assert.equal(portSchema.parse('3002'), 3002);
    assert.equal(portSchema.default(3001).parse(undefined), 3001);
    assert.equal(portSchema.safeParse('0').success, false);
    assert.equal(portSchema.safeParse('70000').success, false);
    assert.equal(portSchema.safeParse('abc').success, false);
  });

  it('nodeEnvSchema y logLevelSchema con valores por defecto', () => {
    assert.equal(nodeEnvSchema.parse(undefined), 'development');
    assert.equal(nodeEnvSchema.safeParse('staging').success, false);
    assert.equal(logLevelSchema.parse(undefined), 'info');
    assert.equal(logLevelSchema.parse('debug'), 'debug');
  });

  it('URLs de infraestructura por esquema', () => {
    assert.equal(databaseUrlSchema.safeParse('postgresql://u:p@localhost:5432/db').success, true);
    assert.equal(databaseUrlSchema.safeParse('postgres://u:p@localhost/db').success, true);
    assert.equal(databaseUrlSchema.safeParse('mysql://u:p@localhost/db').success, false);
    assert.equal(rabbitUrlSchema.safeParse('amqp://leads_svc:x@localhost:5672').success, true);
    assert.equal(rabbitUrlSchema.safeParse('http://localhost').success, false);
    assert.equal(redisUrlSchema.parse(''), undefined);
    assert.equal(redisUrlSchema.parse(undefined), undefined);
    assert.equal(redisUrlSchema.parse('redis://localhost:6379'), 'redis://localhost:6379');
    assert.equal(redisUrlSchema.safeParse('http://localhost:6379').success, false);
  });

  it('booleanFlagSchema acepta true/false/1/0 y vacío = false', () => {
    for (const [input, expected] of [
      ['true', true],
      ['TRUE', true],
      ['1', true],
      ['false', false],
      ['0', false],
      ['', false],
    ] as const) {
      assert.equal(booleanFlagSchema.parse(input), expected, `entrada ${input}`);
    }
    assert.equal(booleanFlagSchema.default(false).parse(undefined), false);
    assert.equal(booleanFlagSchema.safeParse('yes').success, false);
  });

  it('csvSchema y corsOriginsSchema', () => {
    assert.deepEqual(csvSchema.parse(' a, b ,,c '), ['a', 'b', 'c']);
    assert.deepEqual(csvSchema.parse(undefined), []);
    assert.deepEqual(corsOriginsSchema.parse('https://sis.edu.pe, http://localhost:3000'), [
      'https://sis.edu.pe',
      'http://localhost:3000',
    ]);
    assert.deepEqual(corsOriginsSchema.parse(''), []);
    assert.equal(corsOriginsSchema.safeParse('https://sis.edu.pe/').success, false);
    assert.equal(corsOriginsSchema.safeParse('sis.edu.pe').success, false);
  });

  it('jsonSchema valida el contenido', () => {
    const schema = jsonSchema(z.record(z.string(), z.number()));
    assert.deepEqual(schema.parse('{"tacna":1}'), { tacna: 1 });
    assert.equal(schema.safeParse('{"tacna":"1"}').success, false);
    const invalid = schema.safeParse('{no');
    assert.equal(invalid.success, false);
    assert.match(invalid.error?.issues[0]?.message ?? '', /JSON válido/);
  });
});

describe('claves base64', () => {
  it('base64Key32Schema exige 32 bytes exactos', () => {
    assert.equal(base64Key32Schema.parse(PII_ENCRYPTION_KEY), PII_ENCRYPTION_KEY);
    const tooLong = base64Key32Schema.safeParse(PII_HASH_KEY);
    assert.equal(tooLong.success, false);
    assert.match(tooLong.error?.issues[0]?.message ?? '', /exactamente 32 bytes \(tiene 34\)/);
    assert.equal(base64Key32Schema.safeParse('no es base64!').success, false);
  });

  it('base64KeyMin32Schema acepta la clave HMAC de desarrollo (34 bytes)', () => {
    assert.equal(base64KeyMin32Schema.parse(PII_HASH_KEY), PII_HASH_KEY);
    assert.equal(base64KeyMin32Schema.safeParse(Buffer.alloc(16).toString('base64')).success, false);
  });
});

describe('internalTokensSchema', () => {
  const dev = '{"admin-web":"dev-admin-to-leads","ops":"short"}';

  it('convierte el JSON a Record<string,string>', () => {
    const tokens = withEnvContext({ NODE_ENV: 'development' }, () => internalTokensSchema.parse(dev));
    assert.deepEqual(tokens, { 'admin-web': 'dev-admin-to-leads', ops: 'short' });
  });

  it('en producción exige tokens de al menos 16 caracteres', () => {
    const result = withEnvContext({ NODE_ENV: 'production' }, () => internalTokensSchema.safeParse(dev));
    assert.equal(result.success, false);
    assert.match(result.error?.issues[0]?.message ?? '', /"ops".*16 caracteres/);
    const ok = withEnvContext({ NODE_ENV: 'production' }, () =>
      internalTokensSchema.safeParse('{"admin-web":"0123456789abcdef0123"}'),
    );
    assert.equal(ok.success, true);
  });

  it('rechaza formatos inválidos', () => {
    for (const input of ['', '[]', '{"admin-web":""}', '{"Admin Web":"x"}', 'no-json']) {
      assert.equal(internalTokensSchema.safeParse(input).success, false, `entrada ${input}`);
    }
  });
});
