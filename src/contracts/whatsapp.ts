/**
 * Construcción del enlace de WhatsApp. Vive aquí porque frontend y backend
 * deben generar exactamente el mismo mensaje.
 */
export interface WhatsAppMessageInput {
  brandName: string;
  promotionName: string;
  promotionHeadline: string;
  reference: string;
  firstName?: string;
}

export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const greeting = input.firstName ? `Hola, soy ${input.firstName}.` : 'Hola.';
  return [
    `${greeting} Acabo de registrarme en la web de ${input.brandName} y quiero recibir el catálogo.`,
    `Promoción elegida: ${input.promotionName} (${input.promotionHeadline}).`,
    `Código de solicitud: ${input.reference}`,
  ].join('\n');
}

export function buildWhatsAppUrl(numberE164WithoutPlus: string, message: string): string {
  const digits = numberE164WithoutPlus.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Código de referencia corto y legible: prefijo de marca + 5 caracteres sin ambigüedad (sin 0/O/1/I). */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const REFERENCE_PATTERN = /^[A-Z]{2,5}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;
