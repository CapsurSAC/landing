/**
 * Medición propia de uso, para el panel (server/admin/metricas.php).
 *
 * Qué registra, todo sin identificar a la persona:
 *  - Visita: referente, UTM (van en la URL), tamaño de ventana, idioma,
 *    si ya había visitado antes.
 *  - Clics en toda la página con sección, elemento y coordenadas → mapa de
 *    calor y ranking de lo más tocado.
 *  - Tiempo activo en la página y en cada sección, y profundidad de scroll.
 *  - Formulario: qué campos llenó, qué opción eligió en las tres preguntas
 *    (son preferencias, no datos personales), errores de validación, último
 *    campo tocado y envío.
 *  - Nombre, correo y WhatsApp ÚNICAMENTE desde que marca la casilla de
 *    autorización (Ley 29733). Antes de eso no viaja ningún dato personal.
 *  - El identificador del borrador (src/lib/borrador.js), para que quien deja
 *    el formulario a medias y vuelve otro día no figure dos veces en el panel.
 *
 * Envía lotes a /api/metricas.php con sendBeacon, que no bloquea ni se pierde
 * al cerrar la pestaña. Con ?mapa=escritorio|tablet|movil en la URL, en vez de
 * medir dibuja el mapa de calor sobre la página (exige sesión del panel).
 */
import { idBorrador } from './borrador.js';
import { nuevoId } from './uuid.js';

const ENDPOINT = '/api/metricas.php';
const MODO_MAPA = new URLSearchParams(location.search).get('mapa');
const SECCIONES = ['inicio', 'instituciones', 'porque', 'programas', 'formulario'];

function idVisita() {
  try {
    let id = sessionStorage.getItem('capsur_visita');
    if (!id) {
      id = nuevoId();
      sessionStorage.setItem('capsur_visita', id);
    }
    return id;
  } catch {
    return nuevoId();
  }
}
const VISITA = idVisita();

/** true si ya estuvo antes en este navegador (sin guardar quién es). */
function recurrente() {
  try {
    const visto = localStorage.getItem('capsur_visto') === '1';
    localStorage.setItem('capsur_visto', '1');
    return visto;
  } catch {
    return false;
  }
}

const dispositivo = () =>
  innerWidth < 640 ? 'movil' : innerWidth < 1024 ? 'tablet' : 'escritorio';

// ── Envío por lotes ────────────────────────────────────────────────────────
let cola = [];
let temporizador;
let borrador = ''; // el último visto: al enviar el formulario se borra antes de que salga el lote

function enviar() {
  if (!cola.length || MODO_MAPA) return;
  borrador = idBorrador() || borrador;
  const cuerpo = JSON.stringify({
    visita: VISITA,
    borrador,
    dispositivo: dispositivo(),
    pagina: location.href,
    eventos: cola.splice(0, 50),
  });
  const enviado = navigator.sendBeacon?.(
    ENDPOINT,
    new Blob([cuerpo], { type: 'application/json' }),
  );
  if (!enviado) {
    fetch(ENDPOINT, {
      method: 'POST',
      body: cuerpo,
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
  }
}

/** Encola un evento; se envía agrupado 1,5 s después o al salir de la página. */
export function registrar(evento) {
  cola.push(evento);
  clearTimeout(temporizador);
  temporizador = setTimeout(enviar, 1500);
}

// ── Tiempo activo, tiempo por sección y scroll ─────────────────────────────
let activoDesde = null; // ms: desde cuándo la pestaña está visible
let tiempoActivo = 0; // ms acumulados con la pestaña visible
let scrollMax = 0; // % de la página que llegó a ver
const visibles = new Set(); // secciones en pantalla ahora mismo
const seccionDesde = {}; // id → ms desde que entró en pantalla
const tiempoSeccion = Object.fromEntries(SECCIONES.map((s) => [s, 0]));

function pausar() {
  const ahora = Date.now();
  if (activoDesde) tiempoActivo += ahora - activoDesde;
  activoDesde = null;
  for (const id of visibles) {
    if (seccionDesde[id]) tiempoSeccion[id] += ahora - seccionDesde[id];
    seccionDesde[id] = null;
  }
}
function reanudar() {
  const ahora = Date.now();
  activoDesde = ahora;
  for (const id of visibles) seccionDesde[id] = ahora;
}

function medirScroll() {
  const doc = document.documentElement;
  const visto = Math.round(((scrollY + innerHeight) / doc.scrollHeight) * 100);
  if (visto > scrollMax) scrollMax = Math.min(100, visto);
}

function observarSecciones() {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entradas) => {
      const ahora = Date.now();
      for (const en of entradas) {
        const id = en.target.id;
        if (en.isIntersecting) {
          visibles.add(id);
          if (activoDesde) seccionDesde[id] = ahora;
        } else {
          if (seccionDesde[id]) tiempoSeccion[id] += ahora - seccionDesde[id];
          seccionDesde[id] = null;
          visibles.delete(id);
        }
      }
    },
    { threshold: 0.4 },
  );
  for (const id of SECCIONES) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
}

/** Resumen de la visita hasta ahora; se manda cada vez que la pestaña se oculta o se cierra. */
function salida() {
  pausar();
  const segundos = (ms) => Math.round(ms / 1000);
  registrar({
    tipo: 'salida',
    scroll: scrollMax,
    tiempo: segundos(tiempoActivo),
    secciones: Object.fromEntries(Object.entries(tiempoSeccion).map(([k, v]) => [k, segundos(v)])),
  });
  enviar();
}

// ── Clics ──────────────────────────────────────────────────────────────────

/** Sección y elemento legibles: "formulario › button: Quiero recibir orientación". */
function describir(el) {
  const contenedor = el.closest('section, header, footer, #formulario');
  const seccion = contenedor?.id || contenedor?.tagName.toLowerCase() || 'pagina';
  const objetivo =
    el.closest('a, button, input, select, textarea, label, summary, [data-medir]') || el;
  const texto =
    objetivo.dataset.medir ||
    objetivo.getAttribute('aria-label') ||
    objetivo.alt ||
    objetivo.labels?.[0]?.textContent ||
    objetivo.querySelector?.('img')?.alt ||
    objetivo.innerText || // innerText separa los bloques con espacio; textContent los pega
    objetivo.id ||
    '';
  return {
    seccion,
    elemento: `${objetivo.tagName.toLowerCase()}: ${texto.trim().replace(/\s+/g, ' ').slice(0, 60)}`,
  };
}

export function iniciarMedicion() {
  if (MODO_MAPA) {
    dibujarMapa(MODO_MAPA);
    return;
  }

  let referente = '';
  try {
    referente = document.referrer ? new URL(document.referrer).host : '';
  } catch {
    /* referente ilegible: se deja vacío */
  }
  registrar({
    tipo: 'visita',
    referente,
    ancho: innerWidth,
    alto: innerHeight,
    idioma: navigator.language,
    recurrente: recurrente(),
  });

  document.addEventListener(
    'click',
    (e) => {
      if (!(e.target instanceof Element)) return;
      const ancho = document.documentElement.scrollWidth || innerWidth;
      registrar({
        tipo: 'clic',
        ...describir(e.target),
        x: Math.round((e.pageX / ancho) * 1000) / 10, // % del ancho de la página
        y: Math.round(e.pageY), // px desde el inicio de la página
      });
    },
    { capture: true, passive: true },
  );

  if (document.visibilityState === 'visible') reanudar();
  medirScroll();
  observarSecciones();
  addEventListener('scroll', medirScroll, { passive: true });
  addEventListener('pagehide', salida);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') salida();
    else reanudar();
  });
}

// ── Formulario ─────────────────────────────────────────────────────────────

/**
 * Sigue el avance del formulario. Devuelve la función para dejar de seguirlo.
 * Con `restaurado`, anota de entrada los campos que el borrador dejó llenos:
 * en esta visita nadie los tocó, así que ningún evento los contaría.
 * @param {HTMLFormElement | null} form
 * @param {{ restaurado?: boolean }} [opciones]
 */
export function medirFormulario(form, { restaurado = false } = {}) {
  if (!form || MODO_MAPA) return undefined;

  // Nombre, correo y WhatsApp solo con la casilla marcada; si no, objeto vacío.
  const contacto = () =>
    form.consentimiento?.checked
      ? {
          nombre: form.nombre.value.trim().slice(0, 80),
          correo: form.email.value.trim().slice(0, 120),
          whatsapp: form.whatsapp.value.trim().slice(0, 20),
        }
      : {};

  const estaLleno = (campo) =>
    campo.type === 'checkbox' ? campo.checked : campo.value.trim() !== '';

  const anotar = (campo) => {
    if (!(campo instanceof HTMLElement) || !campo.name || campo.name === '_gotcha') return;
    // En los selects se guarda la opción elegida: es una preferencia, no un dato personal.
    const eleccion =
      campo instanceof HTMLSelectElement && campo.value
        ? { valor: campo.value, texto: campo.selectedOptions[0]?.text ?? '' }
        : {};
    registrar({
      tipo: 'campo',
      elemento: campo.name,
      lleno: estaLleno(campo),
      ...eleccion,
      ...contacto(),
    });
  };
  const alCambiar = (e) => anotar(e.target);

  // El navegador dispara "invalid" en cada campo que no pasa la validación al enviar.
  const alFallar = (e) => {
    if (e.target instanceof HTMLElement && e.target.name) {
      registrar({ tipo: 'error', elemento: e.target.name });
    }
  };

  if (restaurado) {
    for (const campo of form.elements) {
      if (campo.name && estaLleno(campo)) anotar(campo);
    }
  }

  form.addEventListener('change', alCambiar);
  form.addEventListener('focusout', alCambiar);
  form.addEventListener('invalid', alFallar, true);
  return () => {
    form.removeEventListener('change', alCambiar);
    form.removeEventListener('focusout', alCambiar);
    form.removeEventListener('invalid', alFallar, true);
  };
}

// ── Mapa de calor ──────────────────────────────────────────────────────────

/** Dibuja los clics guardados como manchas de calor sobre la página actual. */
async function dibujarMapa(disp) {
  let datos;
  try {
    const r = await fetch(`${ENDPOINT}?dispositivo=${encodeURIComponent(disp)}`, {
      credentials: 'same-origin',
    });
    datos = await r.json();
    if (!r.ok) throw new Error(datos.error || r.status);
  } catch (err) {
    alert(`No se pudo cargar el mapa de calor: ${err.message}. Entra primero al panel en /admin/.`);
    return;
  }

  const lienzo = document.createElement('canvas');
  const ancho = document.documentElement.scrollWidth;
  const alto = document.documentElement.scrollHeight;
  lienzo.width = ancho;
  lienzo.height = alto;
  Object.assign(lienzo.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: `${ancho}px`,
    height: `${alto}px`,
    pointerEvents: 'none',
    zIndex: '9998',
    mixBlendMode: 'multiply',
  });
  const ctx = lienzo.getContext('2d');
  const radio = 34;
  for (const [xPct, y] of datos.puntos) {
    const x = (xPct / 100) * ancho;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radio);
    g.addColorStop(0, 'rgba(255, 40, 40, 0.35)');
    g.addColorStop(0.5, 'rgba(255, 170, 0, 0.18)');
    g.addColorStop(1, 'rgba(255, 220, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - radio, y - radio, radio * 2, radio * 2);
  }
  document.body.append(lienzo);

  const aviso = document.createElement('div');
  aviso.setAttribute('role', 'status');
  Object.assign(aviso.style, {
    position: 'fixed',
    bottom: '16px',
    left: '16px',
    zIndex: '9999',
    background: '#0a2a63',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '10px',
    font: '600 13px Montserrat, system-ui, sans-serif',
    boxShadow: '0 10px 30px rgba(0,0,0,.3)',
  });
  aviso.textContent = `Mapa de calor · ${disp} · ${datos.puntos.length} clics en 30 días · míralo con una ventana de ese tamaño`;
  document.body.append(aviso);
}
