'use server';

import { AdminPrivacyResolutionInputSchema } from '@capsur/api-contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { resolvePrivacyRequest } from '@/lib/server/api';
import { authorizeAction } from '@/lib/server/auth';
import { audit } from '@/lib/server/log';

export async function resolvePrivacyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction('privacy:manage');
  if (!auth.ok) return { status: 'error', message: auth.error };

  const id = z.uuid().safeParse(formData.get('requestId'));
  if (!id.success) return { status: 'error', message: 'Solicitud no válida.' };
  const parsed = AdminPrivacyResolutionInputSchema.safeParse({
    status: formData.get('status'),
    resolution: formData.get('resolution') ?? '',
    anonymizeLeads: formData.get('anonymizeLeads') === 'on',
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      fieldErrors[field] ??= field === 'resolution' ? 'Escribe entre 5 y 4 000 caracteres.' : 'Elige una opción.';
    }
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors };
  }

  const result = await resolvePrivacyRequest(id.data, parsed.data, auth.user.email);
  if (!result.ok) return { status: 'error', message: result.error.message };

  audit('admin.privacy.resolve', auth.user.email, {
    requestId: id.data,
    status: parsed.data.status,
    anonymizeLeads: parsed.data.anonymizeLeads,
  });
  revalidatePath('/privacidad');
  redirect(`/privacidad/${id.data}?ok=guardada`);
}
