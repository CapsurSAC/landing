'use client';

import { useActionState } from 'react';
import { ActionFeedback } from '@/components/ActionFeedback';
import { SubmitButton } from '@/components/SubmitButton';
import { IDLE } from '@/lib/action-state';
import { loginAction } from './actions';

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction] = useActionState(loginAction, IDLE);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="email" className="label">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.values?.email}
          required
          maxLength={160}
          className="input"
          aria-invalid={state.status === 'error' || undefined}
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          className="input"
          aria-invalid={state.status === 'error' || undefined}
        />
      </div>
      <ActionFeedback state={state} />
      <SubmitButton className="w-full" pendingLabel="Verificando…">
        Iniciar sesión
      </SubmitButton>
    </form>
  );
}
