import {
  AdminPromotionInputSchema,
  AdminSpecialtyInputSchema,
  PromotionIconSchema,
  SlugSchema,
  SpecialtyTrackSchema,
  type AdminPromotion,
  type AdminPromotionInput,
  type AdminSpecialtyInput,
  type Brand,
} from '@capsur/api-contracts';
import { isoToLimaLocal, limaLocalToIso } from './dates';
import { centsToSoles, solesToCents } from './money';

/**
 * Traducción entre los formularios del panel (texto plano, soles, hora de
 * Lima) y los contratos de promotions-service (céntimos, ISO UTC). Funciones
 * puras: se prueban sin servidor.
 */

export type FieldErrors = Record<string, string>;
export type FormResult<T> = { ok: true; input: T } | { ok: false; errors: FieldErrors };

/** Lo mínimo que necesitamos de FormData (también sirve un objeto de prueba). */
export interface FormLike {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
}

function text(form: FormLike, name: string): string {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

function checkbox(form: FormLike, name: string): boolean {
  const v = form.get(name);
  return v === 'on' || v === 'true' || v === '1';
}

function integer(value: string): number | null {
  return /^-?\d{1,6}$/.test(value) ? Number(value) : null;
}

/* ------------------------------- promociones ------------------------------ */

export interface PromotionFormValues {
  id: string;
  name: string;
  headline: string;
  price: string;
  listPrice: string;
  specialtiesIncluded: string;
  allowedTracks: string[];
  bundleLabel: string;
  featured: boolean;
  icon: string;
  validFrom: string;
  validUntil: string;
  campaignId: string;
  sortOrder: string;
  active: boolean;
}

export const EMPTY_PROMOTION_VALUES: PromotionFormValues = {
  id: '',
  name: '',
  headline: '',
  price: '',
  listPrice: '',
  specialtiesIncluded: '1',
  allowedTracks: ['ia'],
  bundleLabel: '1 especialidad',
  featured: false,
  icon: 'layers',
  validFrom: '',
  validUntil: '',
  campaignId: '',
  sortOrder: '0',
  active: true,
};

export function promotionToFormValues(p: AdminPromotion): PromotionFormValues {
  return {
    id: p.id,
    name: p.name,
    headline: p.headline,
    price: centsToSoles(p.price.amount),
    listPrice: p.listPrice ? centsToSoles(p.listPrice.amount) : '',
    specialtiesIncluded: String(p.bundle.specialtiesIncluded),
    allowedTracks: [...p.bundle.allowedTracks],
    bundleLabel: p.bundle.label,
    featured: p.featured,
    icon: p.icon,
    validFrom: isoToLimaLocal(p.validFrom),
    validUntil: p.validUntil ? isoToLimaLocal(p.validUntil) : '',
    campaignId: p.campaignId ?? '',
    sortOrder: String(p.sortOrder),
    active: p.active,
  };
}

export function readPromotionForm(form: FormLike): PromotionFormValues {
  return {
    id: text(form, 'id'),
    name: text(form, 'name'),
    headline: text(form, 'headline'),
    price: text(form, 'price'),
    listPrice: text(form, 'listPrice'),
    specialtiesIncluded: text(form, 'specialtiesIncluded'),
    allowedTracks: form.getAll('allowedTracks').filter((v): v is string => typeof v === 'string'),
    bundleLabel: text(form, 'bundleLabel'),
    featured: checkbox(form, 'featured'),
    icon: text(form, 'icon'),
    validFrom: text(form, 'validFrom'),
    validUntil: text(form, 'validUntil'),
    campaignId: text(form, 'campaignId'),
    sortOrder: text(form, 'sortOrder'),
    active: checkbox(form, 'active'),
  };
}

const PROMOTION_PATH_TO_FIELD: Record<string, string> = {
  'price.amount': 'price',
  price: 'price',
  'listPrice.amount': 'listPrice',
  listPrice: 'listPrice',
  'bundle.specialtiesIncluded': 'specialtiesIncluded',
  'bundle.allowedTracks': 'allowedTracks',
  'bundle.label': 'bundleLabel',
};

export function parsePromotionForm(values: PromotionFormValues, brand: Brand): FormResult<AdminPromotionInput> {
  const errors: FieldErrors = {};

  if (!SlugSchema.safeParse(values.id).success) {
    errors.id = 'Usa minúsculas, números y guiones (2 a 64 caracteres), p. ej. "con-ia".';
  }
  if (values.name.length < 2 || values.name.length > 40) errors.name = 'Entre 2 y 40 caracteres.';
  if (values.headline.length < 2 || values.headline.length > 20) errors.headline = 'Entre 2 y 20 caracteres, p. ej. "S/249".';

  const price = solesToCents(values.price);
  if (price === null) errors.price = 'Monto en soles con hasta 2 decimales, p. ej. 249 o 249.90.';
  let listPrice: number | null = null;
  if (values.listPrice) {
    listPrice = solesToCents(values.listPrice);
    if (listPrice === null) errors.listPrice = 'Monto en soles con hasta 2 decimales, o déjalo vacío.';
    else if (price !== null && listPrice <= price) errors.listPrice = 'El precio de referencia debe ser mayor que el precio.';
  }

  const included = integer(values.specialtiesIncluded);
  if (included === null || included < 1 || included > 10) errors.specialtiesIncluded = 'Número entero entre 1 y 10.';

  const tracks = values.allowedTracks.filter((t) => SpecialtyTrackSchema.safeParse(t).success);
  if (tracks.length === 0) errors.allowedTracks = 'Marca al menos un tipo de especialidad.';
  if (!values.bundleLabel) errors.bundleLabel = 'Texto corto para la tarjeta, p. ej. "2 especialidades".';

  const icon = PromotionIconSchema.safeParse(values.icon);
  if (!icon.success) errors.icon = 'Elige un icono.';

  const validFrom = limaLocalToIso(values.validFrom);
  if (!validFrom) errors.validFrom = 'Indica fecha y hora de inicio.';
  let validUntil: string | null = null;
  if (values.validUntil) {
    validUntil = limaLocalToIso(values.validUntil);
    if (!validUntil) errors.validUntil = 'Fecha y hora no válidas.';
    else if (validFrom && validUntil <= validFrom) errors.validUntil = 'Debe ser posterior al inicio.';
  }

  if (values.campaignId && !SlugSchema.safeParse(values.campaignId).success) {
    errors.campaignId = 'Slug en minúsculas con guiones, o vacío.';
  }
  const sortOrder = integer(values.sortOrder || '0');
  if (sortOrder === null || sortOrder < 0 || sortOrder > 999) errors.sortOrder = 'Entero entre 0 y 999.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const candidate = {
    id: values.id,
    brand,
    name: values.name,
    headline: values.headline,
    price: { amount: price!, currency: 'PEN' as const },
    ...(listPrice !== null ? { listPrice: { amount: listPrice, currency: 'PEN' as const } } : {}),
    bundle: { specialtiesIncluded: included!, allowedTracks: tracks, label: values.bundleLabel },
    featured: values.featured,
    icon: icon.data,
    validFrom: validFrom!,
    validUntil,
    campaignId: values.campaignId || null,
    sortOrder: sortOrder!,
    active: values.active,
  };
  // Última barrera: el contrato real. Cualquier discrepancia se muestra en el campo.
  const parsed = AdminPromotionInputSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      const field = PROMOTION_PATH_TO_FIELD[path] ?? String(issue.path[0] ?? 'form');
      errors[field] ??= `Valor no válido (${issue.message}).`;
    }
    return { ok: false, errors };
  }
  return { ok: true, input: parsed.data };
}

/* ----------------------------- especialidades ----------------------------- */

export interface SpecialtyFormValues {
  id: string;
  name: string;
  shortName: string;
  track: string;
  summary: string;
  audience: string;
  modality: string;
  endorsedBy: string;
  sortOrder: string;
  active: boolean;
}

export function specialtyToFormValues(s: AdminSpecialtyInput): SpecialtyFormValues {
  return {
    id: s.id,
    name: s.name,
    shortName: s.shortName ?? '',
    track: s.track,
    summary: s.summary,
    audience: s.audience.join('\n'),
    modality: s.modality,
    endorsedBy: s.endorsedBy ?? '',
    sortOrder: String(s.sortOrder),
    active: s.active,
  };
}

export function readSpecialtyForm(form: FormLike): SpecialtyFormValues {
  const raw = form.get('summary');
  const audience = form.get('audience');
  return {
    id: text(form, 'id'),
    name: text(form, 'name'),
    shortName: text(form, 'shortName'),
    track: text(form, 'track'),
    summary: typeof raw === 'string' ? raw.trim() : '',
    audience: typeof audience === 'string' ? audience : '',
    modality: text(form, 'modality'),
    endorsedBy: text(form, 'endorsedBy'),
    sortOrder: text(form, 'sortOrder'),
    active: checkbox(form, 'active'),
  };
}

export function parseSpecialtyForm(values: SpecialtyFormValues, brand: Brand): FormResult<AdminSpecialtyInput> {
  const errors: FieldErrors = {};
  if (!SlugSchema.safeParse(values.id).success) errors.id = 'Identificador no válido.';
  if (values.name.length < 2 || values.name.length > 120) errors.name = 'Entre 2 y 120 caracteres.';
  if (values.shortName.length > 60) errors.shortName = 'Máximo 60 caracteres.';
  const track = SpecialtyTrackSchema.safeParse(values.track);
  if (!track.success) errors.track = 'Elige el tipo.';
  if (values.summary.length < 10 || values.summary.length > 600) errors.summary = 'Entre 10 y 600 caracteres.';
  const audience = values.audience
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (audience.length > 12) errors.audience = 'Máximo 12 líneas.';
  if (!values.modality) errors.modality = 'Indica la modalidad, p. ej. "100% virtual".';
  const sortOrder = integer(values.sortOrder || '0');
  if (sortOrder === null || sortOrder < 0 || sortOrder > 999) errors.sortOrder = 'Entero entre 0 y 999.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const parsed = AdminSpecialtyInputSchema.safeParse({
    id: values.id,
    brand,
    name: values.name,
    ...(values.shortName ? { shortName: values.shortName } : {}),
    track: track.data,
    summary: values.summary,
    audience,
    modality: values.modality,
    ...(values.endorsedBy ? { endorsedBy: values.endorsedBy } : {}),
    sortOrder: sortOrder!,
    active: values.active,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? 'form')] ??= `Valor no válido (${issue.message}).`;
    return { ok: false, errors };
  }
  return { ok: true, input: parsed.data };
}
