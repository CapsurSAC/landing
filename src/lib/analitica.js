/**
 * Medición de conversiones: píxel de Meta y Google Analytics 4.
 *
 * Nada se carga si las variables no están definidas en .env:
 *   VITE_META_PIXEL_ID = 1234567890
 *   VITE_GA4_ID        = G-XXXXXXX
 *
 * Eventos que dispara la landing:
 *   Lead     → al enviarse el formulario con éxito
 *   Contact  → al pulsar el botón de WhatsApp de la pantalla de gracias
 */
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID;
const GA4_ID = import.meta.env.VITE_GA4_ID;

/** Nombre equivalente de cada evento estándar de Meta en GA4. */
const EVENTOS_GA4 = { Lead: 'generate_lead', Contact: 'contact' };

function cargarPixelMeta(id) {
  if (window.fbq) return;
  const fbq = function () {
    fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/es_LA/fbevents.js';
  document.head.append(script);

  fbq('init', id);
  fbq('track', 'PageView');
}

function cargarGa4(id) {
  if (window.gtag) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id);
}

export function iniciarAnalitica() {
  if (PIXEL_ID) cargarPixelMeta(PIXEL_ID);
  if (GA4_ID) cargarGa4(GA4_ID);
}

/**
 * @param {'Lead'|'Contact'} nombre
 * @param {Record<string, string>} [datos]
 */
export function registrarEvento(nombre, datos = {}) {
  window.fbq?.('track', nombre, datos);
  window.gtag?.('event', EVENTOS_GA4[nombre] ?? nombre, datos);
}

/**
 * Página de gracias: al enviar, la dirección pasa a /gracias sin recargar, y
 * se avisa una vista de página a Meta y GA4. Así se puede medir la conversión
 * por URL (una "conversión personalizada" en Meta con la URL /gracias).
 */
export function verGracias() {
  if (location.pathname === '/gracias') return;
  history.pushState({ gracias: true }, '', '/gracias');
  window.fbq?.('track', 'PageView');
  window.gtag?.('event', 'page_view', {
    page_location: location.href,
    page_title: 'Gracias',
  });
}

/** Vuelve a la dirección del formulario ("Enviar otra solicitud"). */
export function salirDeGracias() {
  if (location.pathname === '/gracias') history.replaceState(null, '', '/');
}
