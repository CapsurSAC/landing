'use client';

import { ActionFeedback } from '@/components/ActionFeedback';
import { Field, fieldAria } from '@/components/ui';
import { useFormAction } from '@/components/useFormAction';
import { respondComplaintAction } from './actions';

export function ResponseForm({ complaintId }: { complaintId: string }) {
  const { state, onSubmit, pending } = useFormAction(respondComplaintAction);
  const error = state.fieldErrors?.response;
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3" noValidate>
      <input type="hidden" name="complaintId" value={complaintId} />
      <ActionFeedback state={state} />
      <Field id="response" label="Respuesta al consumidor" error={error} hint="Se registra con tu usuario y la fecha. Entre 10 y 4 000 caracteres.">
        <textarea {...fieldAria('response', error, true)} name="response" rows={8} minLength={10} maxLength={4000} required className="input" />
      </Field>
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Enviando…' : 'Registrar respuesta'}
        </button>
      </div>
    </form>
  );
}
