import { describe, expect, test } from 'vitest';
import { assignVariant, fnv1a, HERO_COPY_EXPERIMENT, HERO_EXPERIMENT_SCRIPT, HERO_VARIANT_ATTRIBUTE, SESSION_STORAGE_KEY } from './experiments';

/** Ejecuta el script en línea con un sessionId fijo y devuelve la variante que marca en <html>. */
function runInlineScript(sessionId: string): string | null {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  document.documentElement.removeAttribute(HERO_VARIANT_ATTRIBUTE);
  new Function(HERO_EXPERIMENT_SCRIPT)();
  return document.documentElement.getAttribute(HERO_VARIANT_ATTRIBUTE);
}

describe('experimento hero-copy (A18)', () => {
  test('FNV-1a conocido', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
  });

  test('la asignación es determinista por sessionId', () => {
    const id = '0b4cf28e-10c8-4a00-8cc6-510c6d5b772d';
    expect(assignVariant(HERO_COPY_EXPERIMENT, id)).toBe(assignVariant(HERO_COPY_EXPERIMENT, id));
  });

  test('reparte las sesiones entre a y b', () => {
    const counts = { a: 0, b: 0 } as Record<string, number>;
    for (let i = 0; i < 1000; i += 1) counts[assignVariant(HERO_COPY_EXPERIMENT, `session-${i}`)]! += 1;
    expect(counts.a).toBeGreaterThan(400);
    expect(counts.b).toBeGreaterThan(400);
  });

  test('el script en línea asigna exactamente la misma variante que assignVariant', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = `sess-${i}-${i * 7919}`;
      expect(runInlineScript(id)).toBe(assignVariant(HERO_COPY_EXPERIMENT, id));
    }
  });

  test('el script crea el sessionId si no existe', () => {
    window.sessionStorage.clear();
    new Function(HERO_EXPERIMENT_SCRIPT)();
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toMatch(/[0-9a-f-]{36}/);
    expect(['a', 'b']).toContain(document.documentElement.getAttribute(HERO_VARIANT_ATTRIBUTE));
  });
});
