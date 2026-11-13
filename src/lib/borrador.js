/**
 * Borrador del formulario: lo que la persona escribió y todavía no envió.
 *
 * Va a dos sitios:
 *  - Este navegador (localStorage, 30 días): todo, para que al volver encuentre
 *    el formulario como lo dejó. La casilla de autorización no se guarda: se
 *    vuelve a marcar cada vez.
 *  - El servidor (api/posible.php), como "posible" en el panel: solo con la
 *    casilla de autorización marcada (Ley 29733) y algún dato de contacto. Si
 *    la desmarca, el servidor lo borra.
 *
 * Al enviar el formulario se borra de los dos.
 */

const CLAVE = 'capsur_borrador';
const VIDA = 30 * 24 * 60 * 60 * 1000; // 30 días
const ESPERA = 1500; // ms sin escribir antes de mandarlo al servidor

// Con Formspree (VITE_FORM_ENDPOINT externo) no hay PHP propio que lo reciba.
const PROPIO = (import.meta.env.VITE_FORM_ENDPOINT || '/api/enviar.php').startsWith('/');
const ENDPOINT = '/api/posible.php';

const nuevoId = () => {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** { id, datos } guardado en este navegador, o null si no hay o caducó. */
export function leerBorrador() {
  try {
    const b = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (!b || typeof b !== 'object' || typeof b.id !== 'string') return null;
    if (Date.now() - (b.guardado || 0) > VIDA) {
      localStorage.removeItem(CLAVE);
      return null;
    }
    return { id: b.id, datos: b.datos && typeof b.datos === 'object' ? b.datos : {} };
  } catch {
    return null; // almacenamiento bloqueado o dañado: se empieza de cero
  }
}

/** Id del borrador de este navegador, o ''. La medición lo manda para no contar dos veces a quien vuelve. */
export const idBorrador = () => leerBorrador()?.id ?? '';

/** Guarda los datos en este navegador y devuelve el id del borrador. */
export function guardarBorrador(datos) {
  const id = leerBorrador()?.id ?? nuevoId();
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ id, guardado: Date.now(), datos }));
  } catch {
    // Navegación privada o sin espacio: el formulario sigue funcionando igual.
  }
  return id;
}

export function borrarBorrador() {
  clearTimeout(temporizador);
  pendiente = null;
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
}

// ── Servidor ───────────────────────────────────────────────────────────────
let temporizador;
let pendiente = null; // último cuerpo aún sin mandar

function mandar(cuerpo, alSalir = false) {
  const json = JSON.stringify(cuerpo);
  if (alSalir && navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }));
    return;
  }
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
    keepalive: true,
  }).catch(() => {
    // Sin conexión: el borrador sigue en el navegador y viaja con el próximo cambio.
  });
}

/** Manda el borrador al servidor cuando la persona deja de escribir un momento. */
export function sincronizarPosible(cuerpo) {
  if (!PROPIO) return;
  pendiente = cuerpo;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    if (pendiente) mandar(pendiente);
    pendiente = null;
  }, ESPERA);
}

/** Al enviar el formulario: lo que quedaba por mandar ya no hace falta. */
export function cancelarSincronizacion() {
  clearTimeout(temporizador);
  pendiente = null;
}

/** Pide al servidor que lo borre (retiró la autorización o tocó "Borrar"). */
export function retirarPosible(id) {
  if (!PROPIO || !id) return;
  cancelarSincronizacion();
  mandar({ id, consentimiento: false });
}

// Si cierra la pestaña antes de que pase la espera, lo pendiente sale igual.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!pendiente) return;
    clearTimeout(temporizador);
    mandar(pendiente, true);
    pendiente = null;
  });
}
