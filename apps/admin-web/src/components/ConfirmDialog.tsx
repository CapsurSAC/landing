'use client';

import { useActionState, useEffect, useId, useRef, type ReactNode } from 'react';
import { IDLE, type ActionState } from '@/lib/action-state';
import { cn } from '@/lib/cn';
import { ActionFeedback } from './ActionFeedback';
import { SubmitButton } from './SubmitButton';

/**
 * Confirmación con el `<dialog>` nativo (foco atrapado, Escape para cerrar y
 * fondo inerte los da el navegador). El formulario de dentro llama a una
 * acción de servidor, que vuelve a comprobar permisos.
 */
export function ConfirmDialog({
  triggerLabel,
  triggerVariant = 'ghost-danger',
  title,
  description,
  confirmLabel,
  action,
  hidden = {},
  children,
  testId,
}: {
  triggerLabel: string;
  triggerVariant?: 'primary' | 'secondary' | 'danger' | 'ghost-danger';
  title: string;
  description: ReactNode;
  confirmLabel: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hidden?: Record<string, string>;
  children?: ReactNode;
  testId?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const [state, formAction] = useActionState(action, IDLE);

  useEffect(() => {
    if (state.status === 'success') dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        className={cn('btn', `btn-${triggerVariant}`)}
        onClick={() => dialogRef.current?.showModal()}
        data-testid={testId}
      >
        {triggerLabel}
      </button>
      {state.status === 'success' && <ActionFeedback state={state} className="mt-2 w-full" />}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-mist-200 bg-white p-0 text-ink-900 shadow-2xl"
      >
        <form action={formAction} className="p-5">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <div id={descId} className="mt-2 text-sm text-ink-600">
            {description}
          </div>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children && <div className="mt-4">{children}</div>}
          {state.status === 'error' && <ActionFeedback state={state} className="mt-4" />}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
            <SubmitButton variant="danger" pendingLabel="Procesando…">
              {confirmLabel}
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
