/**
 * El navegador no importa valores de @capsur/api-contracts (B3). Estas
 * pruebas garantizan que las copias locales siguen idénticas al contrato.
 */
import * as contracts from '@capsur/api-contracts';
import { describe, expect, test } from 'vitest';
import { LEAD_TOKEN_HEADER, parseCreateLeadResponse } from './api-client';
import { buildWhatsAppMessage, buildWhatsAppUrl } from './whatsapp';

describe('paridad con @capsur/api-contracts', () => {
  test('la cabecera del token de estado coincide', () => {
    expect(LEAD_TOKEN_HEADER).toBe(contracts.LEAD_TOKEN_HEADER);
  });

  test('el mensaje y el enlace de WhatsApp son idénticos', () => {
    const input = { brandName: 'Sistemas del Sur', promotionName: 'CON IA', promotionHeadline: 'S/249', reference: 'SIS-7K3M2', firstName: 'Ana' };
    expect(buildWhatsAppMessage(input)).toBe(contracts.buildWhatsAppMessage(input));
    expect(buildWhatsAppUrl('+51 987 654 321', 'Hola & adiós')).toBe(contracts.buildWhatsAppUrl('+51 987 654 321', 'Hola & adiós'));
  });

  test('el parseo manual acepta una respuesta válida según el esquema del contrato', () => {
    const sample = {
      leadId: '0b4cf28e-10c8-4a00-8cc6-510c6d5b772d',
      reference: 'SIS-7K3M2',
      status: 'registered',
      phone: '+51987654321',
      campus: 'arequipa',
      promotion: { id: 'con-ia', name: 'CON IA', headline: 'S/249' },
      specialties: [{ id: 'desarrollo-web-con-ia', name: 'Desarrollo Web con IA' }],
      whatsapp: { number: '51987867402', prefilledMessage: 'Hola', url: 'https://wa.me/51987867402?text=Hola' },
      statusToken: 'abcdefghijklmnopqrstuvwxyz012345',
      replayed: false,
    };
    expect(contracts.CreateLeadResponseSchema.parse(sample)).toEqual(parseCreateLeadResponse(sample));
  });

  test('el parseo manual rechaza respuestas incompletas o con enlaces no https', () => {
    expect(() => parseCreateLeadResponse({ leadId: 'x' })).toThrow();
    expect(() =>
      parseCreateLeadResponse({
        leadId: 'x',
        reference: 'SIS-7K3M2',
        status: 'registered',
        phone: '+51987654321',
        promotion: { id: 'con-ia', name: 'CON IA' },
        whatsapp: { number: '1', url: 'javascript:alert(1)' },
      }),
    ).toThrow();
  });
});
