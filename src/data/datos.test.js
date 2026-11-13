/**
 * Revisa los datos que se editan a mano: que cada programa e institución
 * apunte a archivos que existen y a categorías y áreas válidas. Corre con
 * `npm test`, y en la CI antes de construir.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AREAS, INICIOS, OBJETIVOS } from './opciones.js';
import { INSTITUCIONES, RUTA_LOGOS } from './instituciones.js';
import { CATEGORIAS, PROGRAMAS, RUTA_FOTOS } from './programas.js';

const publico = (ruta) => fileURLToPath(new URL(`../../public${ruta}`, import.meta.url));
const unicos = (lista) => new Set(lista).size === lista.length;

describe('programas', () => {
  it.each(PROGRAMAS.map((p) => [p.id, p]))('%s tiene foto y logo', (_, p) => {
    expect(existsSync(publico(`${RUTA_FOTOS}/${p.foto}`)), p.foto).toBe(true);
    expect(existsSync(publico(`${RUTA_LOGOS}/${p.logo}`)), p.logo).toBe(true);
  });

  it.each(PROGRAMAS.map((p) => [p.id, p]))('%s usa categorías y área que existen', (_, p) => {
    const ids = CATEGORIAS.map((c) => c.id);
    expect(p.categorias.length).toBeGreaterThan(0);
    for (const c of p.categorias) expect(ids).toContain(c);
    if (p.area) expect(AREAS.map((a) => a.value)).toContain(p.area);
  });

  it('no repite ids y cada categoría tiene al menos un programa', () => {
    expect(unicos(PROGRAMAS.map((p) => p.id))).toBe(true);
    for (const c of CATEGORIAS) {
      expect(PROGRAMAS.some((p) => p.categorias.includes(c.id)), c.id).toBe(true);
    }
  });
});

describe('instituciones', () => {
  it.each(INSTITUCIONES.map((i) => [i.nombre, i]))('%s tiene logo', (_, i) => {
    expect(existsSync(publico(`${RUTA_LOGOS}/${i.archivo}`)), i.archivo).toBe(true);
  });
});

describe('opciones del formulario', () => {
  it('no repiten valores y las áreas traen un código para Chatwoot', () => {
    for (const lista of [AREAS, OBJETIVOS, INICIOS]) {
      expect(unicos(lista.map((o) => o.value))).toBe(true);
    }
    expect(unicos(AREAS.map((a) => a.codigo))).toBe(true);
    for (const a of AREAS) expect(a.codigo).toMatch(/^[A-Z]{2,6}$/);
  });
});
