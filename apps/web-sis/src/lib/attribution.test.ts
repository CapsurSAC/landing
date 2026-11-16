import { describe, expect, test } from 'vitest';
import { parseAttribution } from './attribution';

describe('parseAttribution', () => {
  test('extrae los parámetros UTM y la ruta de aterrizaje', () => {
    const result = parseAttribution(
      'https://sis.example.com/?utm_source=meta&utm_campaign=especialidades-ia&utm_medium=cpc',
      'https://l.facebook.com/l.php',
    );
    expect(result.utmSource).toBe('meta');
    expect(result.utmCampaign).toBe('especialidades-ia');
    expect(result.utmMedium).toBe('cpc');
    expect(result.referrer).toBe('https://l.facebook.com/l.php');
    expect(result.landingPath ?? '').toMatch(/^\/\?utm_source=meta/);
  });

  test('ignora el referrer del mismo dominio y URLs inválidas', () => {
    expect(parseAttribution('no-es-una-url')).toEqual({});
    const result = parseAttribution('https://sis.example.com/promos', 'https://sis.example.com/');
    expect(result.referrer).toBeUndefined();
    expect(result.landingPath).toBe('/promos');
  });

  test('recorta valores demasiado largos', () => {
    const long = 'x'.repeat(500);
    const result = parseAttribution(`https://sis.example.com/?utm_source=${long}`);
    expect(result.utmSource?.length).toBe(100);
  });
});
