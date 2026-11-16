/**
 * Reglas del formulario de catálogo en el navegador (B3: sin Zod). El
 * servidor vuelve a validar todo con el esquema completo del contrato; aquí
 * solo se guía al usuario con los mismos límites.
 */
import type { Campus } from '@capsur/api-contracts';
import type { PhoneCountryCode } from './config';

export type LeadFieldName = 'fullName' | 'phone' | 'email' | 'contactAccepted';

export interface LeadFormValues {
  fullName: string;
  phoneCountry: PhoneCountryCode;
  phone: string;
  email: string;
  campus: Campus;
  contactAccepted: boolean;
  marketingAccepted: boolean;
}

export const INITIAL_LEAD_FORM: LeadFormValues = {
  fullName: '',
  phoneCountry: 'PE',
  phone: '',
  email: '',
  campus: 'tacna',
  contactAccepted: true,
  marketingAccepted: false,
};

export const NAME_PATTERN = /^[\p{L}\p{M}'’ .-]+$/u;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateLeadForm(values: LeadFormValues): Partial<Record<LeadFieldName, string>> {
  const errors: Partial<Record<LeadFieldName, string>> = {};
  const name = values.fullName.trim();
  if (name.length < 3) errors.fullName = 'Escribe tu nombre y apellidos.';
  else if (name.length > 120) errors.fullName = 'El nombre es demasiado largo (máximo 120 caracteres).';
  else if (!NAME_PATTERN.test(name)) errors.fullName = 'Usa solo letras y espacios en el nombre.';

  const digits = values.phone.replace(/\D/g, '');
  if (values.phoneCountry === 'PE') {
    if (!/^9\d{8}$/.test(digits)) errors.phone = 'Escribe tu WhatsApp: 9 dígitos y empieza con 9.';
  } else if (digits.length < 6 || digits.length > 15) {
    errors.phone = 'Escribe un número de WhatsApp válido.';
  }

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
    phoneCountry: (typeof r.phoneCountry === 'string' && /^[A-Z]{2}$/.test(r.phoneCountry) ? r.phoneCountry : 'PE') as PhoneCountryCode,
    phone: text('phone', 25),
    email: text('email', 160),
    campus: r.campus === 'arequipa' ? 'arequipa' : 'tacna',
    contactAccepted: r.contactAccepted !== false,
    marketingAccepted: r.marketingAccepted === true,
  };
}
