/**
 * Prueba A/B del titular (src/data/contenido.js → VARIANTES_TITULAR).
 * Cada navegador recibe una variante al azar y la conserva; la medición la
 * anota en la visita para comparar leads por variante en el panel.
 */
import { VARIANTES_TITULAR } from '../data/contenido.js';

const CLAVE = 'capsur_variante';

function elegir() {
  if (VARIANTES_TITULAR.length < 2) return null;
  try {
    const guardada = localStorage.getItem(CLAVE);
    const existe = VARIANTES_TITULAR.find((v) => v.id === guardada);
    if (existe) return existe;
    const nueva = VARIANTES_TITULAR[Math.floor(Math.random() * VARIANTES_TITULAR.length)];
    localStorage.setItem(CLAVE, nueva.id);
    return nueva;
  } catch {
    return VARIANTES_TITULAR[0];
  }
}

/** La variante de este visitante, o null si no hay prueba en curso. */
export const VARIANTE = elegir();
