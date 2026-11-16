'use client';

import { ActionFeedback } from '@/components/ActionFeedback';
import { Field, fieldAria } from '@/components/ui';
import { useFormAction } from '@/components/useFormAction';
import { resolvePrivacyAction } from './actions';

export function ResolutionForm({
  requestId,
  currentStatus,
  suggestAnonymize,
}: {
  requestId: string;
  currentStatus: string;
  suggestAnonymize: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction(resolvePrivacyAction);
  const errors = state.fieldErrors ?? {};
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <ActionFeedback state={state} />
      <Field id="status" label="Nuevo estado" error={errors.status} className="max-w-xs">
        <select {...fieldAria('status', errors.status)} name="status" defaultValue={currentStatus === 'received' ? 'in_progress' : currentStatus} className="input">
          <option value="in_progress">En trámite</option>
          <option value="resolved">Resuelta</option>
          <option value="rejected">Rechazada</option>
        </select>
      </Field>
      <Field id="resolution" label="Resolución / respuesta al titular" error={errors.resolution} hint="Entre 5 y 4 000 caracteres. Queda registrada con tu usuario.">
        <textarea {...fieldAria('resolution', errors.resolution, true)} name="resolution" rows={6} maxLength={4000} required className="input" />
      </Field>
      <label className="flex items-start gap-2 rounded-lg border border-mist-200 p-3 text-sm">
        <input type="checkbox" name="anonymizeLeads" defaultChecked={false} className="mt-0.5 size-4 accent-danger-600" />
        <span>
          Anonimizar los leads asociados a este titular
          <span className="block text-xs text-ink-500">
            Irreversible. Solo se aplica a cancelación o revocación del consentimiento
            {suggestAnonymize ? ' (corresponde a esta solicitud).' : '; en este tipo de solicitud no tendrá efecto.'}
          </span>
        </span>
      </label>
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar resolución'}
        </button>
      </div>
    </form>
  );
}
