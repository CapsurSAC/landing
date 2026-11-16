import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ComplaintRequestSchema } from './compliance.js';
import { CreateLeadRequestSchema } from './leads.js';
import { IDEMPOTENCY_KEY_PATTERN, safeJsonForScript } from './security.js';
import { buildWhatsAppMessage, buildWhatsAppUrl, REFERENCE_PATTERN } from './whatsapp.js';

test('el mensaje de WhatsApp incluye promoción y código de referencia', () => {
  const msg = buildWhatsAppMessage({
    brandName: 'Sistemas del Sur',
    promotionName: 'CON IA',
    promotionHeadline: 'S/249',
    reference: 'SIS-7K3M2',
    firstName: 'Ana',
  });
  assert.match(msg, /Ana/);
  assert.match(msg, /CON IA \(S\/249\)/);
  assert.match(msg, /SIS-7K3M2/);
});

test('la URL de WhatsApp limpia el número y codifica el texto', () => {
  const url = buildWhatsAppUrl('+51 987 654 321', 'Hola\nmundo');
  assert.equal(url, 'https://wa.me/51987654321?text=Hola%0Amundo');
});

test('el patrón de referencia acepta códigos válidos y rechaza ambiguos', () => {
  assert.ok(REFERENCE_PATTERN.test('SIS-7K3M2'));
  assert.equal(REFERENCE_PATTERN.test('SIS-0O1IL'), false);
});

test('el contrato de lead acepta un registro válido y normaliza el correo', () => {
  const result = CreateLeadRequestSchema.safeParse({
    brand: 'sis',
    promotionId: 'con-ia',
    fullName: 'Ana Pérez',
    phone: '987 654 321',
    email: 'Ana@Example.com',
    consent: { contactAccepted: true, privacyVersion: '2026-11' },
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.email, 'ana@example.com');
    assert.equal(result.data.phoneCountry, 'PE');
    assert.equal(result.data.consent.marketingAccepted, false);
  }
});

test('el lead admite especialidades y sede con valores por defecto', () => {
  const result = CreateLeadRequestSchema.parse({
    brand: 'sis',
    promotionId: 'dos-por-uno',
    specialtyIds: ['desarrollo-web-con-ia', 'computacion-e-informatica'],
    fullName: 'Ana Pérez',
    phone: '987654321',
    email: 'ana@example.com',
    consent: { contactAccepted: true, privacyVersion: '2026-11' },
  });
  assert.equal(result.campus, 'tacna');
  assert.equal(result.specialtyIds.length, 2);
});

test('el libro de reclamaciones exige apoderado si el consumidor es menor', () => {
  const base = {
    brand: 'sis',
    kind: 'reclamo',
    consumer: {
      fullName: 'Luis Mamani',
      documentType: 'DNI',
      documentNumber: '12345678',
      address: 'Calle Falsa 123, Tacna',
      phone: '987654321',
      email: 'luis@example.com',
      isMinor: true,
    },
    item: { description: 'Especialidad Desarrollo Web con IA' },
    detail: 'No recibí el acceso a la plataforma en la fecha indicada.',
    request: 'Que me habiliten el acceso.',
  };
  assert.equal(ComplaintRequestSchema.safeParse(base).success, false);
  const ok = ComplaintRequestSchema.safeParse({ ...base, consumer: { ...base.consumer, guardianName: 'Rosa Quispe' } });
  assert.equal(ok.success, true);
});

test('safeJsonForScript impide cerrar la etiqueta script', () => {
  const out = safeJsonForScript({ name: '</script><script>alert(1)</script>' });
  assert.equal(out.includes('</script>'), false);
  assert.deepEqual(JSON.parse(out), { name: '</script><script>alert(1)</script>' });
});

test('el patrón de Idempotency-Key acepta UUID y rechaza texto libre', () => {
  assert.ok(IDEMPOTENCY_KEY_PATTERN.test('7d1f0d3c-5f7e-4f0a-9d8a-0c1c2f6c1a11'));
  assert.equal(IDEMPOTENCY_KEY_PATTERN.test('clave-cualquiera-123'), false);
});

test('el contrato de lead rechaza el honeypot con contenido y el consentimiento en falso', () => {
  const spam = CreateLeadRequestSchema.safeParse({
    brand: 'sis',
    promotionId: 'con-ia',
    fullName: 'Ana Pérez',
    phone: '987654321',
    email: 'ana@example.com',
    consent: { contactAccepted: true, privacyVersion: '2026-11' },
    website: 'spam',
  });
  assert.equal(spam.success, false);

  const noConsent = CreateLeadRequestSchema.safeParse({
    brand: 'sis',
    promotionId: 'con-ia',
    fullName: 'Ana Pérez',
    phone: '987654321',
    email: 'ana@example.com',
    consent: { contactAccepted: false, privacyVersion: '2026-11' },
  });
  assert.equal(noConsent.success, false);
});
