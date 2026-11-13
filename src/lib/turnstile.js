/**
 * Cloudflare Turnstile: comprobación anti-bots casi siempre invisible.
 *
 * Apagado mientras VITE_TURNSTILE_SITE_KEY esté vacío. Con la clave, el
 * formulario obtiene un token en segundo plano y lo manda con el envío;
 * server/api/enviar.php lo verifica con TURNSTILE_SECRET. Solo si Cloudflare
 * duda de la persona le muestra una casilla.
 */
const CLAVE = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

export const turnstileActivo = Boolean(CLAVE);

let carga;
function cargar() {
  carga ??= new Promise((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolver(window.turnstile);
    script.onerror = rechazar;
    document.head.append(script);
  });
  return carga;
}

/**
 * Pone el widget en `contenedor` y avisa cada token nuevo (o '' si caducó).
 * Devuelve { reiniciar, quitar }.
 */
export async function montarTurnstile(contenedor, alCambiarToken) {
  if (!CLAVE || !contenedor) return { reiniciar() {}, quitar() {} };
  const turnstile = await cargar();
  const id = turnstile.render(contenedor, {
    sitekey: CLAVE,
    appearance: 'interaction-only',
    language: 'es',
    callback: alCambiarToken,
    'expired-callback': () => alCambiarToken(''),
    'error-callback': () => alCambiarToken(''),
  });
  return {
    reiniciar: () => turnstile.reset(id),
    quitar: () => turnstile.remove(id),
  };
}
