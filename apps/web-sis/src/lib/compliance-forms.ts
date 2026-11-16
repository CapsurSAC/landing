/**
 * Validación ligera (sin Zod, B3) de los formularios de Libro de
 * Reclamaciones y derechos ARCO. Replica los límites de ComplaintRequestSchema
 * y PrivacyRequestSchema; el backend valida de nuevo con el esquema completo.
 */
import type { ComplaintInput, PrivacyRequestInput, PrivacyRequestType } from '@capsur/api-contracts';
import { EMAIL_PATTERN } from './lead-form';

export type FormErrors = Record<string, string>;

const DOCUMENT_PATTERN = /^[A-Za-z0-9-]+$/;

function text(errors: FormErrors, key: string, value: string, min: number, max: number, message: string) {
  const v = value.trim();
  if (v.length < min) errors[key] = message;
  else if (v.length > max) errors[key] = `Máximo ${max} caracteres.`;
}

export interface ComplaintFormValues {
  kind: 'reclamo' | 'queja';
  fullName: string;
  documentType: 'DNI' | 'CE' | 'PASAPORTE';
  documentNumber: string;
  address: string;
  phone: string;
  email: string;
  isMinor: boolean;
  guardianName: string;
  itemType: 'producto' | 'servicio';
  itemDescription: string;
  /** Monto en soles tal como lo escribe el usuario (opcional). */
  amount: string;
  detail: string;
  request: string;
  acceptsTerms: boolean;
}

export const INITIAL_COMPLAINT: ComplaintFormValues = {
  kind: 'reclamo',
  fullName: '',
  documentType: 'DNI',
  documentNumber: '',
  address: '',
  phone: '',
  email: '',
  isMinor: false,
  guardianName: '',
  itemType: 'servicio',
  itemDescription: '',
  amount: '',
  detail: '',
  request: '',
  acceptsTerms: false,
};

/** «249.90» o «249,90» → 24990 céntimos. null si está vacío; NaN si no es válido. */
export function parseSolesToCents(raw: string): number | null {
  const v = raw.trim().replace(/\s/g, '');
  if (!v) return null;
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(v)) return Number.NaN;
  return Math.round(Number.parseFloat(v.replace(',', '.')) * 100);
}

export function validateComplaint(v: ComplaintFormValues): FormErrors {
  const errors: FormErrors = {};
  text(errors, 'fullName', v.fullName, 3, 120, 'Escribe tu nombre completo.');
  const doc = v.documentNumber.trim();
  if (doc.length < 6 || doc.length > 20 || !DOCUMENT_PATTERN.test(doc)) {
    errors.documentNumber = 'Escribe un número de documento válido (6 a 20 letras o números).';
  } else if (v.documentType === 'DNI' && !/^\d{8}$/.test(doc)) {
    errors.documentNumber = 'El DNI tiene 8 dígitos.';
  }
  text(errors, 'address', v.address, 5, 200, 'Escribe tu domicilio.');
  const phoneDigits = v.phone.replace(/\D/g, '');
  if (phoneDigits.length < 6 || v.phone.trim().length > 25) errors.phone = 'Escribe un teléfono de contacto válido.';
  if (!EMAIL_PATTERN.test(v.email.trim()) || v.email.trim().length > 160) errors.email = 'Escribe un correo válido.';
  if (v.isMinor && v.guardianName.trim().length < 3) {
    errors.guardianName = 'Si eres menor de edad, indica el nombre de tu padre, madre o apoderado.';
  }
  text(errors, 'itemDescription', v.itemDescription, 3, 300, 'Describe el servicio o producto contratado.');
  const cents = parseSolesToCents(v.amount);
  if (cents !== null && Number.isNaN(cents)) errors.amount = 'Escribe el monto en soles, por ejemplo 249.00.';
  text(errors, 'detail', v.detail, 10, 3000, 'Cuéntanos qué ocurrió (al menos 10 caracteres).');
  text(errors, 'request', v.request, 5, 1500, 'Indica qué solicitas (al menos 5 caracteres).');
  if (!v.acceptsTerms) errors.acceptsTerms = 'Confirma que los datos son verdaderos para registrar tu hoja de reclamación.';
  return errors;
}

export function toComplaintInput(v: ComplaintFormValues, extra: { captchaToken?: string; website?: string }): ComplaintInput {
  const cents = parseSolesToCents(v.amount);
  return {
    brand: 'sis',
    kind: v.kind,
    consumer: {
      fullName: v.fullName.trim(),
      documentType: v.documentType,
      documentNumber: v.documentNumber.trim(),
      address: v.address.trim(),
      phone: v.phone.trim(),
      email: v.email.trim().toLowerCase(),
      isMinor: v.isMinor,
      ...(v.isMinor ? { guardianName: v.guardianName.trim() } : {}),
    },
    item: {
      type: v.itemType,
      description: v.itemDescription.trim(),
      ...(cents !== null && !Number.isNaN(cents) ? { amount: cents } : {}),
    },
    detail: v.detail.trim(),
    request: v.request.trim(),
    ...(extra.captchaToken ? { captchaToken: extra.captchaToken } : {}),
    website: extra.website ?? '',
  };
}

/** Rutas de error del backend («consumer.email») → nombre de campo del formulario. */
export function complaintFieldFromPath(path: string): string {
  const map: Record<string, string> = {
    'consumer.fullName': 'fullName',
    'consumer.documentType': 'documentType',
    'consumer.documentNumber': 'documentNumber',
    'consumer.address': 'address',
    'consumer.phone': 'phone',
    'consumer.email': 'email',
    'consumer.guardianName': 'guardianName',
    'item.description': 'itemDescription',
    'item.amount': 'amount',
    'item.type': 'itemType',
  };
  return map[path] ?? path;
}

export interface PrivacyFormValues {
  type: PrivacyRequestType;
  fullName: string;
  email: string;
  phone: string;
  reference: string;
  detail: string;
}

export const INITIAL_PRIVACY: PrivacyFormValues = {
  type: 'access',
  fullName: '',
  email: '',
  phone: '',
  reference: '',
  detail: '',
};

export function validatePrivacyRequest(v: PrivacyFormValues): FormErrors {
  const errors: FormErrors = {};
  text(errors, 'fullName', v.fullName, 3, 120, 'Escribe tu nombre completo.');
  if (!EMAIL_PATTERN.test(v.email.trim()) || v.email.trim().length > 160) errors.email = 'Escribe un correo válido.';
  if (v.phone.trim() && (v.phone.replace(/\D/g, '').length < 6 || v.phone.trim().length > 25)) {
    errors.phone = 'Escribe un teléfono válido o deja el campo vacío.';
  }
  if (v.reference.trim().length > 20) errors.reference = 'El código tiene como máximo 20 caracteres.';
  if (v.detail.trim().length > 1000) errors.detail = 'Máximo 1000 caracteres.';
  if ((v.type === 'rectification' || v.type === 'opposition') && v.detail.trim().length < 5) {
    errors.detail = 'Indica qué dato quieres rectificar o a qué tratamiento te opones.';
  }
  return errors;
}

export function toPrivacyInput(v: PrivacyFormValues, extra: { captchaToken?: string; website?: string }): PrivacyRequestInput {
  return {
    brand: 'sis',
    type: v.type,
    fullName: v.fullName.trim(),
    email: v.email.trim().toLowerCase(),
    ...(v.phone.trim() ? { phone: v.phone.trim() } : {}),
    ...(v.reference.trim() ? { reference: v.reference.trim().toUpperCase() } : {}),
    ...(v.detail.trim() ? { detail: v.detail.trim() } : {}),
    ...(extra.captchaToken ? { captchaToken: extra.captchaToken } : {}),
    website: extra.website ?? '',
  };
}
