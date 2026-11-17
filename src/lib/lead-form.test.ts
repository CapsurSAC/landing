import { describe, expect, test } from 'vitest';
import { coerceDraft, INITIAL_LEAD_FORM, isFakePeruPhone, sanitizePeruPhone, validateLeadForm, type LeadFormValues } from './lead-form';

const valid: LeadFormValues = {
  ...INITIAL_LEAD_FORM,
  fullName: 'Ana Pérez Quispe',
  phone: '956482731',
  email: 'ana@example.com',
};

describe('validateLeadForm', () => {
  test('acepta un formulario completo de Perú', () => {
    expect(validateLeadForm(valid)).toEqual({});
  });

  test('exige nombre con letras (tildes, ñ y apóstrofos incluidos)', () => {
    expect(validateLeadForm({ ...valid, fullName: 'Al' }).fullName).toMatch(/nombre y apellidos/);
    expect(validateLeadForm({ ...valid, fullName: 'Ana 123' }).fullName).toMatch(/solo letras/);
    expect(validateLeadForm({ ...valid, fullName: "Iñaki O’Higgins-Núñez" }).fullName).toBeUndefined();
    expect(validateLeadForm({ ...valid, fullName: 'a'.repeat(121) }).fullName).toMatch(/demasiado largo/);
  });

  test('valida el celular peruano: 9 dígitos que empiezan con 9', () => {
    expect(validateLeadForm({ ...valid, phone: '12345' }).phone).toMatch(/9 dígitos/);
    expect(validateLeadForm({ ...valid, phone: '856482731' }).phone).toMatch(/9 dígitos/);
    expect(validateLeadForm({ ...valid, phone: '956 482 731' }).phone).toBeUndefined();
    // Un fijo no es WhatsApp.
    expect(validateLeadForm({ ...valid, phone: '(052) 245862' }).phone).toMatch(/9 dígitos/);
  });

  test('rechaza números de relleno', () => {
    for (const fake of ['987654321', '912345678', '911111111', '999999999', '912121212', '900000000', '923456789']) {
      expect(validateLeadForm({ ...valid, phone: fake }).phone, fake).toMatch(/no parece real/);
    }
    for (const real of ['956482731', '906648503', '987123450', '941703258']) {
      expect(isFakePeruPhone(real), real).toBe(false);
    }
  });
});

describe('sanitizePeruPhone', () => {
  test('deja solo 9 dígitos y quita el +51 que trae el autocompletado o un pegado', () => {
    expect(sanitizePeruPhone('+51 956 482 731')).toBe('956482731');
    expect(sanitizePeruPhone('51956482731')).toBe('956482731');
    expect(sanitizePeruPhone('0051 956482731')).toBe('956482731');
    expect(sanitizePeruPhone('956-482-731')).toBe('956482731');
    expect(sanitizePeruPhone('95648273199')).toBe('956482731');
    expect(sanitizePeruPhone('abc')).toBe('');
  });
});

describe('validateLeadForm (otros campos)', () => {
  test('valida el correo y la autorización de contacto', () => {
    expect(validateLeadForm({ ...valid, email: 'ana@' }).email).toMatch(/correo válido/);
    expect(validateLeadForm({ ...valid, contactAccepted: false }).contactAccepted).toMatch(/autorización/);
  });
});

describe('coerceDraft', () => {
  test('restaura solo campos conocidos y con tipos válidos', () => {
    const draft = coerceDraft({ fullName: 'Ana', phone: 5, campus: 'arequipa', extra: 'x', phoneCountry: 'zz' });
    expect(draft).toEqual({ ...INITIAL_LEAD_FORM, fullName: 'Ana', campus: 'arequipa' });
    expect(coerceDraft({ phone: '+51 956 482 731' })?.phone).toBe('956482731');
    expect(coerceDraft(null)).toBeNull();
  });
});
