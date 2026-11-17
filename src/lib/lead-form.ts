/**
 * Reglas del formulario de catálogo (B3: sin Zod). Las comparten el navegador
 * y /api/leads. Solo se aceptan celulares de Perú (+51).
 */
import type { Campus } from '@capsur/api-contracts';

export type LeadFieldName = 'fullName' | 'phone' | 'email' | 'contactAccepted';

export interface LeadFormValues {
  fullName: string;
  /** Solo dígitos, sin el +51 (lo deja así sanitizePeruPhone). */
  phone: string;
  email: string;
  campus: Campus;
  contactAccepted: boolean;
  marketingAccepted: boolean;
}

export const INITIAL_LEAD_FORM: LeadFormValues = {
  fullName: '',
  phone: '',
  email: '',
  campus: 'tacna',
  contactAccepted: true,
  marketingAccepted: false,
};

export const NAME_PATTERN = /^[\p{L}\p{M}'’ .-]+$/u;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Deja el celular como 9 dígitos a lo sumo, quitando el +51 / 51 / 0051 que
 * suelen traer el autocompletado o un pegado. Se aplica en cada tecla.
 */
export function sanitizePeruPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0051')) digits = digits.slice(4);
  else if (digits.length > 9 && digits.startsWith('51')) digits = digits.slice(2);
  return digits.slice(0, 9);
}

/** Mayor tramo de dígitos consecutivos que suben o bajan de uno en uno (987654… o 123456…). */
function longestRun(digits: string): number {
  let best = 1;
  let up = 1;
  let down = 1;
  for (let i = 1; i < digits.length; i += 1) {
    const diff = Number(digits[i]) - Number(digits[i - 1]);
    up = diff === 1 ? up + 1 : 1;
    down = diff === -1 ? down + 1 : 1;
    best = Math.max(best, up, down);
  }
  return best;
}

/**
 * Números de relleno: 987654321, 912345678, 911111111, 912121212…
 * shortcut: heurística; un número real muy «redondo» podría caer aquí, en ese caso el asesor lo verá por WhatsApp.
 */
export function isFakePeruPhone(digits: string): boolean {
  return new Set(digits.slice(1)).size <= 2 || longestRun(digits) >= 7;
}

/** Error del celular, o undefined si es válido. */
export function peruPhoneError(phone: string): string | undefined {
  const digits = sanitizePeruPhone(phone);
  if (!/^9\d{8}$/.test(digits)) return 'Escribe tu celular: 9 dígitos y empieza con 9.';
  if (isFakePeruPhone(digits)) return 'Ese número no parece real. Escribe tu celular de WhatsApp.';
  return undefined;
}

export function validateLeadForm(values: LeadFormValues): Partial<Record<LeadFieldName, string>> {
  const errors: Partial<Record<LeadFieldName, string>> = {};
  const name = values.fullName.trim();
  if (name.length < 3) errors.fullName = 'Escribe tu nombre y apellidos.';
  else if (name.length > 120) errors.fullName = 'El nombre es demasiado largo (máximo 120 caracteres).';
  else if (!NAME_PATTERN.test(name)) errors.fullName = 'Usa solo letras y espacios en el nombre.';

  const phoneError = peruPhoneError(values.phone);
  if (phoneError) errors.phone = phoneError;

  const email = values.email.trim();
  if (!EMAIL_PATTERN.test(email) || email.length > 160) errors.email = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
  if (!values.contactAccepted) errors.contactAccepted = 'Necesitamos tu autorización para enviarte el catálogo por WhatsApp.';
  return errors;
}

/** Restaura un borrador guardado aceptando solo campos y tipos conocidos. */
export function coerceDraft(raw: unknown): LeadFormValues | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const text = (key: string, max: number) => (typeof r[key] === 'string' ? (r[key] as string).slice(0, max) : '');
  return {
    fullName: text('fullName', 120),
    phone: sanitizePeruPhone(text('phone', 25)),
    email: text('email', 160),
    campus: r.campus === 'arequipa' ? 'arequipa' : 'tacna',
    contactAccepted: r.contactAccepted !== false,
    marketingAccepted: r.marketingAccepted === true,
  };
}
