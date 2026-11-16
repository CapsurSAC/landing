/**
 * El navegador no importa valores de @capsur/api-contracts (B3). Estas
 * pruebas garantizan que las copias locales siguen idénticas al contrato.
 */
import * as contracts from '@capsur/api-contracts';
import { describe, expect, test } from 'vitest';
import { buildWhatsAppMessage, buildWhatsAppUrl } from './whatsapp';

describe('paridad con @capsur/api-contracts', () => {
  test('el mensaje y el enlace de WhatsApp son idénticos', () => {
    const input = { brandName: 'Sistemas del Sur', promotionName: 'CON IA', promotionHeadline: 'S/249', reference: 'SIS-7K3M2', firstName: 'Ana' };
    expect(buildWhatsAppMessage(input)).toBe(contracts.buildWhatsAppMessage(input));
    expect(buildWhatsAppUrl('+51 987 654 321', 'Hola & adiós')).toBe(contracts.buildWhatsAppUrl('+51 987 654 321', 'Hola & adiós'));
  });
});
