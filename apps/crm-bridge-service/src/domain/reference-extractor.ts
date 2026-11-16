import { REFERENCE_PATTERN } from '@capsur/api-contracts';

/**
 * Busca un código de solicitud (p. ej. `SIS-7K3M2`) dentro de un texto libre, como el
 * primer mensaje de WhatsApp. Se construye a partir de `REFERENCE_PATTERN` del contrato
 * para que el formato viva en un solo sitio.
 */
const INNER_PATTERN = REFERENCE_PATTERN.source.replace(/^\^/, '').replace(/\$$/, '');
const SCAN_PATTERN = new RegExp(`(?<![A-Z0-9])${INNER_PATTERN}(?![A-Z0-9])`, 'g');

export function extractReference(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }
  const upper = text.toUpperCase();
  const matches = upper.match(SCAN_PATTERN);
  if (!matches) {
    return null;
  }
  for (const candidate of matches) {
    if (REFERENCE_PATTERN.test(candidate)) {
      return candidate;
    }
  }
  return null;
}
