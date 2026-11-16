import { extractReference } from './reference-extractor';

describe('extractReference', () => {
  it('encuentra el código dentro del mensaje de WhatsApp', () => {
    const message = 'Hola, soy María. Acabo de registrarme.\nPromoción elegida: Con IA.\nCódigo de solicitud: SIS-7K3M2';
    expect(extractReference(message)).toBe('SIS-7K3M2');
  });

  it('acepta minúsculas y puntuación alrededor', () => {
    expect(extractReference('mi codigo es sis-7k3m2.')).toBe('SIS-7K3M2');
    expect(extractReference('(SIS-7K3M2)')).toBe('SIS-7K3M2');
  });

  it('ignora cadenas que no cumplen el alfabeto sin ambigüedad', () => {
    expect(extractReference('SIS-7K3M1')).toBeNull();
    expect(extractReference('SIS-0OOOO')).toBeNull();
    expect(extractReference('XSIS-7K3M2X')).toBeNull();
    expect(extractReference('')).toBeNull();
    expect(extractReference(null)).toBeNull();
  });
});
