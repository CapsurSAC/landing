import { type LeadCreatedPayload } from '@capsur/api-contracts';
import { firstName } from './lead-labels';

/**
 * Seguimiento con plantilla aprobada de WhatsApp (A6). La plantilla debe existir y estar
 * APROBADA en Meta (WhatsApp Manager) con categoría UTILITY, el mismo nombre e idioma que
 * `WHATSAPP_FOLLOWUP_TEMPLATE_NAME` / `_LANGUAGE` y exactamente tres variables en el cuerpo:
 *   {{1}} nombre de pila · {{2}} nombre de la promoción · {{3}} código de solicitud.
 * Fuera de la ventana de 24 h, WhatsApp solo acepta mensajes de plantilla.
 */
export const FOLLOWUP_TEMPLATE_CATEGORY = 'UTILITY';

/** Reintentos de un seguimiento ante fallos reintentables (después queda FAILED). */
export const FOLLOWUP_MAX_ATTEMPTS = 3;

export interface FollowupTemplateMessage {
  /** Texto renderizado que Chatwoot muestra en la conversación. */
  content: string;
  templateParams: {
    name: string;
    category: typeof FOLLOWUP_TEMPLATE_CATEGORY;
    language: string;
    processedParams: Record<string, string>;
  };
}

export function buildFollowupTemplateMessage(
  payload: Pick<LeadCreatedPayload, 'fullName' | 'reference' | 'promotion'>,
  template: { name: string; language: string },
): FollowupTemplateMessage {
  const name = firstName(payload.fullName) || 'hola';
  const processedParams = { '1': name, '2': payload.promotion.name, '3': payload.reference };
  return {
    content:
      `Hola ${name}, te escribimos de SIS por tu solicitud ${payload.reference} de la promoción ` +
      `«${payload.promotion.name}». Responde a este mensaje y un asesor te enviará el catálogo.`,
    templateParams: {
      name: template.name,
      category: FOLLOWUP_TEMPLATE_CATEGORY,
      language: template.language,
      processedParams,
    },
  };
}
