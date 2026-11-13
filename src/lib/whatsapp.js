/**
 * Enlaces de WhatsApp con el mensaje ya escrito. La línea "Ref: EM1-COMP"
 * (origen-área) es la que lee el flujo de Chatwoot para elegir la rama.
 */
import { AREAS } from '../data/opciones.js';
import { prefijoOrigen } from './origen.js';

/** WhatsApp de atención (solo dígitos). Vacío = sin botones de WhatsApp. */
export const WHATSAPP = (import.meta.env.VITE_WHATSAPP_NUMERO || '').replace(/\D/g, '');

/** "Ref: WEB-COMP": origen de la visita y código del área (GEN si no hay). */
export const referencia = (codigo) => `Ref: ${prefijoOrigen()}-${codigo || 'GEN'}`;

/** wa.me con el texto ya escrito. */
export const aWhatsApp = (texto) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;

/**
 * Mensaje tras el formulario, con sus respuestas, para que el asesor las tenga
 * a la vista al atender. Si la persona borra la línea "Ref:", el flujo la
 * reconoce igual por la frase "acabo de enviar el formulario de CAPSUR".
 *
 * El flujo busca "-COMP", "-MIN"… en cualquier parte del mensaje: por eso al
 * nombre se le quitan los guiones y el correo no viaja aquí (ya está en el
 * correo interno y en el panel).
 *
 * `enviado` es false cuando el servidor falló: el mensaje lo dice, porque en
 * ese caso las respuestas solo llegan por aquí.
 */
export const enlaceWhatsApp = (ultimo, enviado = true) => {
  const nombre = (ultimo?.nombre ?? '').replace(/[-*_~\s]+/g, ' ').trim();
  const saludo = enviado
    ? 'Hola, acabo de enviar el formulario de CAPSUR y quisiera recibir orientación.'
    : 'Hola, intenté enviar el formulario de CAPSUR y no se pudo. Quisiera recibir orientación.';
  const respuestas = [
    ['Nombre', nombre],
    ['Área de interés', ultimo?.area],
    ['Programa', ultimo?.programa],
    ['Objetivo', ultimo?.objetivo],
    ['Inicio', ultimo?.inicio],
  ]
    .filter(([, valor]) => valor)
    .map(([etiqueta, valor]) => `*${etiqueta}:* ${valor}`);
  const texto = [saludo, respuestas.join('\n'), referencia(ultimo?.codigo)]
    .filter(Boolean)
    .join('\n\n');
  return aWhatsApp(texto);
};

/**
 * Consulta por un programa desde programas.html. Nombres e instituciones no
 * llevan guiones, así que no confunden al flujo.
 */
export const enlacePrograma = (p) =>
  aWhatsApp(
    [
      `Hola, quisiera información sobre *${p.titulo}* de ${p.institucion}.`,
      referencia(AREAS.find((a) => a.value === p.area)?.codigo),
    ].join('\n\n'),
  );
