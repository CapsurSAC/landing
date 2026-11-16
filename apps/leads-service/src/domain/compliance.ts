/** Tipos de correlativo de cumplimiento: libro de reclamaciones y derechos ARCO. */
export type ComplianceSequenceKind = 'LR' | 'ARCO';

/** Plazos legales en días hábiles. */
export const COMPLAINT_RESPONSE_BUSINESS_DAYS = 15;
export const PRIVACY_RESPONSE_BUSINESS_DAYS = 20;

const SEQUENCE_DIGITS = 6;
const MAX_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1;

/**
 * Código correlativo legible: `SIS-LR-2026-000123` / `SIS-ARCO-2026-000045`.
 * El correlativo es por marca, tipo y año y no tiene huecos (lo garantiza la
 * tabla `compliance_sequences` con bloqueo de fila).
 */
export function formatComplianceCode(prefix: string, kind: ComplianceSequenceKind, year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new Error(`Correlativo fuera de rango: ${sequence}`);
  }
  return `${prefix.toUpperCase()}-${kind}-${year}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}

/** Tipos ARCO que permiten anonimizar los leads asociados al resolver. */
export const ANONYMIZING_PRIVACY_TYPES: ReadonlySet<string> = new Set(['cancellation', 'revoke_consent', 'opposition']);
