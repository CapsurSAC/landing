import { describe, expect, test } from 'vitest';
import { coerceDraft, INITIAL_LEAD_FORM, validateLeadForm, type LeadFormValues } from './lead-form';

const valid: LeadFormValues = {
  ...INITIAL_LEAD_FORM,
  fullName: 'Ana Pérez Quispe',
  phone: '987 654 321',
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
    expect(validateLeadForm({ ...valid, phone: '887654321' }).phone).toMatch(/9 dígitos/);
    expect(validateLeadForm({ ...valid, phone: '987-654-321' }).phone).toBeUndefined();
  });

  test('para otros países acepta de 6 a 15 dígitos', () => {
    expect(validateLeadForm({ ...valid, phoneCountry: 'CL', phone: '9 1234 5678' }).phone).toBeUndefined();
    expect(validateLeadForm({ ...valid, phoneCountry: 'CL', phone: '123' }).phone).toMatch(/válido/);
  });

  test('valida el correo y la autorización de contacto', () => {
    expect(validateLeadForm({ ...valid, email: 'ana@' }).email).toMatch(/correo válido/);
    expect(validateLeadForm({ ...valid, contactAccepted: false }).contactAccepted).toMatch(/autorización/);
  });
});

describe('coerceDraft', () => {
  test('restaura solo campos conocidos y con tipos válidos', () => {
    const draft = coerceDraft({ fullName: 'Ana', phone: 5, campus: 'arequipa', extra: 'x', phoneCountry: 'zz' });
    expect(draft).toEqual({ ...INITIAL_LEAD_FORM, fullName: 'Ana', campus: 'arequipa' });
    expect(coerceDraft(null)).toBeNull();
  });
});
