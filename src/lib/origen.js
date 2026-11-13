/**
 * Origen del visitante: UTM y fbclid.
 *
 * Se capturan al cargar la página y se guardan en sessionStorage, para que
 * sobrevivan a una recarga o a una navegación interna (por ejemplo, abrir la
 * política de privacidad y volver). El formulario los envía como campos
 * propios y arma con ellos la referencia del mensaje de WhatsApp.
 */

const CLAVE = 'capsur_origen';
const CAMPOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid'];

const vacio = () => Object.fromEntries(CAMPOS.map((c) => [c, '']));

/** Lee los parámetros de la URL actual y, si trae alguno, reemplaza lo guardado. */
export function capturarOrigen() {
  const params = new URLSearchParams(window.location.search);
  const actual = vacio();
  let hay = false;
  for (const campo of CAMPOS) {
    const valor = (params.get(campo) || '').trim().slice(0, 100);
    if (valor) {
      actual[campo] = valor;
      hay = true;
    }
  }
  if (!hay) return;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(actual));
  } catch {
    // Navegación privada o almacenamiento bloqueado: leerOrigen() usará la URL.
  }
}

/** Origen de esta visita: lo guardado en la sesión o, si no hay, la URL actual. */
export function leerOrigen() {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
    if (guardado && typeof guardado === 'object') return { ...vacio(), ...guardado };
  } catch {
    // Sin acceso al almacenamiento: se cae a la URL.
  }
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(CAMPOS.map((c) => [c, (params.get(c) || '').trim().slice(0, 100)]));
}

/**
 * Prefijo corto del origen para la referencia de WhatsApp:
 *   EM1 … EM5  correo N de la secuencia (utm_content=correo_N)
 *   EM         correo sin número
 *   MA         anuncio de Meta (fbclid o utm_source de Meta)
 *   WEB        visita directa o de cualquier otro sitio
 */
export function prefijoOrigen(origen = leerOrigen()) {
  const fuente = origen.utm_source.toLowerCase();
  const medio = origen.utm_medium.toLowerCase();

  if (fuente.includes('email') || medio.includes('email')) {
    const numero = origen.utm_content.toLowerCase().match(/^correo_([1-9])$/)?.[1];
    return numero ? `EM${numero}` : 'EM';
  }
  if (origen.fbclid || /^(facebook|fb|instagram|ig|meta)$/.test(fuente)) return 'MA';
  return 'WEB';
}
