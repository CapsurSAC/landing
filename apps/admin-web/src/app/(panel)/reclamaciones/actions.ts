'use server';

import { AdminComplaintResponseInputSchema } from '@capsur/api-contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { respondComplaint } from '@/lib/server/api';
import { authorizeAction } from '@/lib/server/auth';
import { audit } from '@/lib/server/log';

export async function respondComplaintAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction('complaints:manage');
  if (!auth.ok) return { status: 'error', message: auth.error };

  const id = z.uuid().safeParse(formData.get('complaintId'));
  if (!id.success) return { status: 'error', message: 'Registro no válido.' };
  const input = AdminComplaintResponseInputSchema.safeParse({ response: formData.get('response') ?? '' });
  if (!input.success) {
    return {
      status: 'error',
      message: 'Revisa la respuesta.',
      fieldErrors: { response: 'Escribe entre 10 y 4 000 caracteres.' },
    };
  }

  const result = await respondComplaint(id.data, input.data.response, auth.user.email);
  if (!result.ok) return { status: 'error', message: result.error.message };

  audit('admin.complaint.respond', auth.user.email, { complaintId: id.data });
  revalidatePath('/reclamaciones');
  redirect(`/reclamaciones/${id.data}?ok=respondida`);
}
