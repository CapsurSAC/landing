import { describe, expect, it } from 'vitest';
import { buildCatalogRequestMessage, buildWhatsAppUrl } from './whatsapp';

const base = {
  brandName: 'Sistemas del Sur',
  fullName: 'Ana Pérez',
  promotionName: 'CON IA',
  promotionHeadline: 'S/249',
};

describe('buildCatalogRequestMessage', () => {
  it('lleva nombre, carrera y promoción', () => {
    const msg = buildCatalogRequestMessage({ ...base, specialtyNames: ['Ciberseguridad 4.0', 'Desarrollo Web con IA'] });
    expect(msg).toBe(
      [
        'Hola, soy Ana Pérez. Quiero recibir el catálogo de Sistemas del Sur.',
        'Carrera: Ciberseguridad 4.0, Desarrollo Web con IA',
        'Promoción: CON IA (S/249)',
      ].join('\n'),
    );
  });

  it('sin especialidades indica que lo decide con un asesor', () => {
    expect(buildCatalogRequestMessage({ ...base, specialtyNames: [] })).toContain('Carrera: Lo decido con un asesor');
  });

  it('se codifica en el enlace de wa.me', () => {
    const url = buildWhatsAppUrl('51987867402', buildCatalogRequestMessage({ ...base, specialtyNames: [] }));
    expect(url.startsWith('https://wa.me/51987867402?text=Hola%2C%20soy%20Ana%20P%C3%A9rez.')).toBe(true);
  });
});
