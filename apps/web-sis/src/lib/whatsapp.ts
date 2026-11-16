/**
 * Enlaces de WhatsApp en el navegador. Replica `buildWhatsAppUrl` y
 * `buildWhatsAppMessage` de @capsur/api-contracts sin importar el paquete
 * (B3: evitar Zod en el bundle). Una prueba unitaria comprueba que ambos
 * generan exactamente el mismo resultado.
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
