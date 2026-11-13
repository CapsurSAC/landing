/**
 * Core Web Vitals de cada visita, medidas en el navegador del visitante:
 *   LCP  cuánto tarda en verse lo principal (ms)
 *   CLS  cuánto "salta" la página al cargar (sin unidad; bueno < 0,1)
 *   INP  cuánto tarda en responder a un toque o clic (ms; el peor visto)
 * Viajan con el evento de salida de la medición (src/lib/medicion.js) y el
 * panel muestra el percentil 75, que es como las evalúa Google.
 */
let lcp = 0;
let cls = 0;
let inp = 0;

function observar(tipo, alVer, opciones = {}) {
  try {
    new PerformanceObserver((lista) => lista.getEntries().forEach(alVer)).observe({
      type: tipo,
      buffered: true,
      ...opciones,
    });
  } catch {
    // Navegador sin esa medición (Safari no tiene INP): se queda en 0.
  }
}

export function iniciarVitales() {
  observar('largest-contentful-paint', (e) => {
    lcp = Math.round(e.startTime);
  });
  observar('layout-shift', (e) => {
    if (!e.hadRecentInput) cls += e.value;
  });
  observar(
    'event',
    (e) => {
      if (e.interactionId) inp = Math.max(inp, Math.round(e.duration));
    },
    { durationThreshold: 40 },
  );
}

export const vitales = () => ({ lcp, cls: Math.round(cls * 1000) / 1000, inp });
