/**
 * Respuesta automática al vincular la conversación (A8): saludo por nombre, promoción,
 * enlace del catálogo (si existe en `CATALOG_URLS_JSON`) y asesor asignado.
 */
export interface AutoReplyInput {
  firstName: string;
  promotionName: string;
  reference: string;
  catalogUrl: string | null;
  agentName: string | null;
}

export function buildAutoReplyMessage(input: AutoReplyInput): string {
  const greeting = input.firstName ? `¡Hola, ${input.firstName}!` : '¡Hola!';
  const lines = [
    `${greeting} Recibimos tu solicitud ${input.reference} para la promoción «${input.promotionName}».`,
  ];
  if (input.catalogUrl) {
    lines.push(`Aquí tienes el catálogo: ${input.catalogUrl}`);
  }
  lines.push(
    input.agentName
      ? `Te atenderá ${input.agentName}, tu asesor(a) asignado(a), en breve.`
      : 'Un asesor(a) te atenderá en breve.',
  );
  return lines.join('\n');
}
