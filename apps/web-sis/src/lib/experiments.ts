/**
 * Experimentos A/B (A18). La variante se asigna de forma determinista con un
 * hash FNV-1a de `<experimento>:<sessionId>`, así el mismo visitante ve la
 * misma variante durante toda la sesión y el backend puede reproducirla.
 *
 * Para evitar el parpadeo y el CLS, la asignación del hero se resuelve antes
 * del primer pintado con un script en línea (con nonce) que marca
 * `<html data-exp-hero-copy="a|b">`; el CSS muestra solo el texto de esa
 * variante. `HERO_EXPERIMENT_SCRIPT` replica `assignVariant` (lo comprueba
 * una prueba unitaria).
 */

export const SESSION_STORAGE_KEY = 'sis.session.v1';

export interface ExperimentDefinition {
  id: string;
  variants: readonly string[];
}

export const HERO_COPY_EXPERIMENT = { id: 'hero-copy', variants: ['a', 'b'] } as const satisfies ExperimentDefinition;

/** Atributo de <html> donde el script deja la variante del hero. */
export const HERO_VARIANT_ATTRIBUTE = 'data-exp-hero-copy';

/** FNV-1a de 32 bits sobre las unidades UTF-16 (suficiente para repartir sesiones). */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function assignVariant(experiment: ExperimentDefinition, sessionId: string): string {
  const index = fnv1a(`${experiment.id}:${sessionId}`) % experiment.variants.length;
  return experiment.variants[index] ?? experiment.variants[0] ?? 'a';
}

/**
 * Script en línea del <head>: crea el sessionId si no existe (mismo que usa
 * el tracking) y marca la variante del hero. Si sessionStorage no está
 * disponible, deja la variante «a» (control).
 */
export const HERO_EXPERIMENT_SCRIPT = `(function(){try{var k=${JSON.stringify(SESSION_STORAGE_KEY)};var s=sessionStorage.getItem(k);if(!s){s=crypto.randomUUID();sessionStorage.setItem(k,s);}var t=${JSON.stringify(`${HERO_COPY_EXPERIMENT.id}:`)}+s;var h=0x811c9dc5;for(var i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}var v=${JSON.stringify(HERO_COPY_EXPERIMENT.variants)};document.documentElement.setAttribute(${JSON.stringify(HERO_VARIANT_ATTRIBUTE)},v[(h>>>0)%v.length]);}catch(e){document.documentElement.setAttribute(${JSON.stringify(HERO_VARIANT_ATTRIBUTE)},'a');}})();`;

/** Variante activa del hero leída del DOM (la fijó el script en línea). */
export function readHeroVariant(): string | null {
  if (typeof document === 'undefined') return null;
  return document.documentElement.getAttribute(HERO_VARIANT_ATTRIBUTE);
}
