import { describe, expect, test } from 'vitest';
import { fallbackPromotions, fallbackSpecialties } from './fallback-catalog';
import { INITIAL_COMPLAINT, parseSolesToCents, toComplaintInput, validateComplaint, validatePrivacyRequest, INITIAL_PRIVACY } from './compliance-forms';
import { scrubEvent, scrubText } from './sentry-scrub';
import { eligibleSpecialties, reconcileSelection, toggleSpecialty } from './specialty-selection';

describe('selector de especialidades (A3)', () => {
  const conIa = fallbackPromotions.find((p) => p.id === 'con-ia')!;
  const dosPorUno = fallbackPromotions.find((p) => p.id === 'dos-por-uno')!;

  test('filtra por tipos permitidos', () => {
    expect(eligibleSpecialties(conIa, fallbackSpecialties).every((s) => s.track === 'ia')).toBe(true);
    expect(eligibleSpecialties(dosPorUno, fallbackSpecialties)).toHaveLength(fallbackSpecialties.length);
  });

  test('respeta el máximo y con 1 se comporta como radio', () => {
    expect(toggleSpecialty([], 'a', 1)).toEqual(['a']);
    expect(toggleSpecialty(['a'], 'b', 1)).toEqual(['b']);
    expect(toggleSpecialty(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    expect(toggleSpecialty(['a', 'b'], 'a', 2)).toEqual(['b']);
  });

  test('al cambiar de promoción descarta elecciones inválidas', () => {
    const eligible = eligibleSpecialties(conIa, fallbackSpecialties);
    expect(reconcileSelection(['desarrollo-web-con-ia', 'computacion-e-informatica'], eligible, 1)).toEqual(['desarrollo-web-con-ia']);
  });
});

describe('formularios de cumplimiento (A5, C9)', () => {
  const complaint = {
    ...INITIAL_COMPLAINT,
    fullName: 'Ana Pérez',
    documentNumber: '12345678',
    address: 'Calle Falsa 123, Tacna',
    phone: '987654321',
    email: 'Ana@Example.com',
    itemDescription: 'Especialidad Desarrollo Web con IA',
    amount: '249,90',
    detail: 'No recibí el acceso a la plataforma.',
    request: 'Habilitar el acceso.',
    acceptsTerms: true,
  };

  test('un reclamo completo es válido y se convierte al contrato', () => {
    expect(validateComplaint(complaint)).toEqual({});
    const input = toComplaintInput(complaint, { website: '' });
    expect(input.consumer.email).toBe('ana@example.com');
    expect(input.item.amount).toBe(24990);
    expect(input.consumer.guardianName).toBeUndefined();
  });

  test('menor de edad exige apoderado y el DNI tiene 8 dígitos', () => {
    const errors = validateComplaint({ ...complaint, isMinor: true, documentNumber: '1234567' });
    expect(errors.guardianName).toBeDefined();
    expect(errors.documentNumber).toMatch(/8 dígitos/);
  });

  test('montos en soles', () => {
    expect(parseSolesToCents('')).toBeNull();
    expect(parseSolesToCents('249')).toBe(24900);
    expect(parseSolesToCents('abc')).toBeNaN();
  });

  test('ARCO: rectificación exige detalle', () => {
    const base = { ...INITIAL_PRIVACY, fullName: 'Ana Pérez', email: 'ana@example.com' };
    expect(validatePrivacyRequest(base)).toEqual({});
    expect(validatePrivacyRequest({ ...base, type: 'rectification' }).detail).toBeDefined();
  });
});

describe('Sentry sin PII (C23)', () => {
  test('borra usuario, cookies, cuerpo, cabeceras sensibles y datos en textos', () => {
    const event = scrubEvent({
      user: { email: 'ana@example.com', ip_address: '1.2.3.4' },
      message: 'Fallo para ana@example.com con 987 654 321',
      request: {
        url: 'https://sis.example.com/solicitud/1#token=abcdefghijklmnop',
        cookies: { a: 'b' },
        data: '{"phone":"987654321"}',
        query_string: 'utm_source=x',
        headers: { 'x-lead-token': 'secreto', accept: 'text/html' },
      },
      exception: { values: [{ value: 'Error con +51987654321' }] },
    });
    expect(event).not.toHaveProperty('user');
    expect(event.message).toBe('Fallo para [correo] con [número]');
    expect(event.request).toEqual({ url: 'https://sis.example.com/solicitud/1', headers: { accept: 'text/html' } });
    expect(event.exception.values[0]?.value).toBe('Error con [número]');
    expect(scrubText('token=abc_123')).toBe('token=[token]');
  });
});
