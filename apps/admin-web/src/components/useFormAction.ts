'use client';

import { startTransition, useActionState, type FormEvent } from 'react';
import { IDLE, type ActionState } from '@/lib/action-state';

/**
 * Envía un formulario a una acción de servidor SIN el reinicio automático de
 * React 19 (que borraría lo escrito cuando la validación falla).
 */
export function useFormAction(action: (state: ActionState, formData: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(action, IDLE);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, onSubmit, pending };
}
