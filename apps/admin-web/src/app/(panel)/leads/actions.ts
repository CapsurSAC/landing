'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { anonymizeLead } from '@/lib/server/api';
import { authorizeAction } from '@/lib/server/auth';
import { audit } from '@/lib/server/log';

const AnonymizeSchema = z.object({
  leadId: z.uuid(),
  deleteCrmContact: z.boolean(),
});

export async function anonymizeLeadAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction('leads:anonymize');
  if (!auth.ok) return { status: 'error', message: auth.error };

  const parsed = AnonymizeSchema.safeParse({
    leadId: formData.get('leadId'),
    deleteCrmContact: formData.get('deleteCrmContact') === 'on',
  });
  if (!parsed.success) return { status: 'error', message: 'Solicitud no válida.' };

  const result = await anonymizeLead(parsed.data.leadId, parsed.data.deleteCrmContact, auth.user.email);
  if (!result.ok) return { status: 'error', message: result.error.message };

  audit('admin.lead.anonymize', auth.user.email, { leadId: parsed.data.leadId, deleteCrmContact: parsed.data.deleteCrmContact });
  revalidatePath(`/leads/${parsed.data.leadId}`);
  return {
    status: 'success',
    message: parsed.data.deleteCrmContact
      ? 'Lead anonimizado. El contacto de Chatwoot se eliminará en segundo plano.'
      : 'Lead anonimizado.',
  };
}
