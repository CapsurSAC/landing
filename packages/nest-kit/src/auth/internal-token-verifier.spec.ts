import { readActor } from './internal-auth.guard';
import { InternalTokenVerifier, parseInternalTokens } from './internal-token-verifier';

const TOKENS = '{"admin-web":"dev-admin-to-promotions","leads-service":"dev-leads-to-promotions"}';

describe('InternalTokenVerifier (C4)', () => {
  const verifier = new InternalTokenVerifier(TOKENS);

  it('identifica al llamador por su token', () => {
    expect(verifier.identify('dev-admin-to-promotions')).toBe('admin-web');
    expect(verifier.identify('dev-leads-to-promotions')).toBe('leads-service');
    expect(verifier.callers).toEqual(['admin-web', 'leads-service']);
  });

  it('rechaza tokens desconocidos, prefijos y vacíos', () => {
    expect(verifier.identify('dev-admin-to-promotion')).toBeNull();
    expect(verifier.identify('dev-admin-to-promotionsX')).toBeNull();
    expect(verifier.identify('')).toBeNull();
    expect(verifier.identify(undefined)).toBeNull();
  });

  it('lee la cabecera Authorization Bearer', () => {
    expect(verifier.identifyAuthorization('Bearer dev-admin-to-promotions')).toBe('admin-web');
    expect(verifier.identifyAuthorization('bearer dev-admin-to-promotions')).toBe('admin-web');
    expect(verifier.identifyAuthorization('Basic dev-admin-to-promotions')).toBeNull();
    expect(verifier.identifyAuthorization('dev-admin-to-promotions')).toBeNull();
    expect(verifier.identifyAuthorization(undefined)).toBeNull();
  });

  it('acepta el objeto ya validado y valida el JSON', () => {
    expect(new InternalTokenVerifier({ ops: 'dev-ops-to-crm' }).identify('dev-ops-to-crm')).toBe('ops');
    expect(parseInternalTokens('')).toEqual({});
    expect(() => parseInternalTokens('{no json')).toThrow(/JSON válido/);
    expect(() => parseInternalTokens('["a"]')).toThrow(/objeto JSON/);
    expect(() => parseInternalTokens('{"ops":""}')).toThrow(/"ops"/);
  });
});

describe('readActor', () => {
  it('acepta correos y rechaza valores con controles o demasiado largos', () => {
    expect(readActor(' asesor@capsur.pe ')).toBe('asesor@capsur.pe');
    expect(readActor('a\nb')).toBeNull();
    expect(readActor('x'.repeat(255))).toBeNull();
    expect(readActor(undefined)).toBeNull();
  });
});
