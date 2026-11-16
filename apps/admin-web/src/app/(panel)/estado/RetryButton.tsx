'use client';

import { RotateCcw } from 'lucide-react';
import { useActionState } from 'react';
import { ActionFeedback } from '@/components/ActionFeedback';
import { SubmitButton } from '@/components/SubmitButton';
import { IDLE } from '@/lib/action-state';
import { retryFailedAction } from './actions';

export function RetryButton({ pendingJobs }: { pendingJobs: number }) {
  const [state, formAction] = useActionState(retryFailedAction, IDLE);
  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="primary" pendingLabel="Reprocesando…">
          <RotateCcw className="size-4" aria-hidden="true" />
          Reprocesar fallidos
        </SubmitButton>
        <span className="text-xs text-ink-500">
          {pendingJobs > 0 ? `${pendingJobs} trabajos en FAILED/DEAD.` : 'Sin trabajos fallidos.'} Primero FAILED, luego DEAD.
        </span>
      </form>
      <ActionFeedback state={state} />
    </div>
  );
}
