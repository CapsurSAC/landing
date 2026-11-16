'use server';

import { SlugSchema } from '@capsur/api-contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionState } from '@/lib/action-state';
import { parsePromotionForm, parseSpecialtyForm, readPromotionForm, readSpecialtyForm } from '@/lib/catalog-forms';
import { createPromotion, deactivatePromotion, updatePromotion, updateSpecialty } from '@/lib/server/api';
import { authorizeAction } from '@/lib/server/auth';
import { brand } from '@/lib/server/env';
import { audit } from '@/lib/server/log';
import type { ServiceError } from '@/lib/server/services';

function serviceErrorState(error: ServiceError): ActionState {
  const detail = error.fieldErrors?.map((f) => `${f.path}: ${f.message}`).join(' · ');
  return { status: 'error', message: detail ? `${error.message} (${detail})` : error.message };
}

export async function savePromotionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction('promotions:manage');
  if (!auth.ok) return { status: 'error', message: auth.error };

  const mode = formData.get('mode') === 'edit' ? 'edit' : 'create';
  const values = readPromotionForm(formData);
  const parsed = parsePromotionForm(values, brand());
  if (!parsed.ok) {
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: parsed.errors };
  }

  const result =
    mode === 'create'
      ? await createPromotion(parsed.input, auth.user.email)
      : await updatePromotion(parsed.input.id, parsed.input, auth.user.email);
  if (!result.ok) {
    if (mode === 'create' && result.error.status === 409) {
      return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: { id: 'Ya existe una promoción con ese identificador.' } };
    }
    return serviceErrorState(result.error);
  }

  audit(mode === 'create' ? 'admin.promotion.create' : 'admin.promotion.update', auth.user.email, { promotionId: parsed.input.id });
  revalidatePath('/promociones');
  redirect(`/promociones?ok=${mode === 'create' ? 'creada' : 'actualizada'}&id=${encodeURIComponent(parsed.input.id)}`);
}

export async function deactivatePromotionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction('promotions:manage');
  if (!auth.ok) return { status: 'error', message: auth.error };
  const id = SlugSchema.safeParse(formData.get('id'));
  if (!id.success) return { status: 'error', message: 'Promoción no válida.' };

  const result = await deactivatePromotion(id.data, auth.user.email);
  if (!result.ok) return serviceErrorState(result.error);
  audit('admin.promotion.deactivate', auth.user.email, { promotionId: id.data });
  revalidatePath('/promociones');
  return { status: 'success', message: 'Promoción desactivada. Ya no aparecerá en la landing.' };
}

export async function saveSpecialtyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction('promotions:manage');
  if (!auth.ok) return { status: 'error', message: auth.error };
  const parsed = parseSpecialtyForm(readSpecialtyForm(formData), brand());
  if (!parsed.ok) return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors: parsed.errors };

  const result = await updateSpecialty(parsed.input.id, parsed.input, auth.user.email);
  if (!result.ok) return serviceErrorState(result.error);
  audit('admin.specialty.update', auth.user.email, { specialtyId: parsed.input.id });
  revalidatePath('/promociones/especialidades');
  redirect(`/promociones/especialidades?ok=actualizada&id=${encodeURIComponent(parsed.input.id)}`);
}
