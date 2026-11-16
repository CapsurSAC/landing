'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { safeNextPath } from '@/lib/csp';
import { can, homeFor } from '@/lib/roles';
import { attemptLogin, startSession } from '@/lib/server/auth';
import { log } from '@/lib/server/log';
import { SessionConfigError } from '@/lib/session';
import { AdminUsersConfigError } from '@/lib/users';

const LoginSchema = z.object({
  email: z.email().max(160),
  password: z.string().min(1).max(200),
});

const NEXT_PERMISSIONS: [string, Parameters<typeof can>[1]][] = [
  ['/leads', 'leads:read'],
  ['/promociones', 'promotions:manage'],
  ['/reclamaciones', 'complaints:manage'],
  ['/privacidad', 'privacy:manage'],
  ['/estado', 'status:read'],
];

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rawEmail = formData.get('email');
  // Solo se devuelve el correo (nunca la contraseña) para no obligar a reescribirlo.
  const values = { email: typeof rawEmail === 'string' ? rawEmail.slice(0, 160) : '' };
  const parsed = LoginSchema.safeParse({ email: rawEmail, password: formData.get('password') });
  if (!parsed.success) {
    return { status: 'error', message: 'Escribe tu correo y tu contraseña.', values };
  }

  let target: string;
  try {
    const outcome = await attemptLogin(parsed.data.email, parsed.data.password);
    if (!outcome.ok) {
      return outcome.reason === 'blocked'
        ? {
            status: 'error',
            message: `Demasiados intentos fallidos. Vuelve a intentarlo en ${outcome.retryAfterMinutes} min.`,
            values,
          }
        : { status: 'error', message: 'Correo o contraseña incorrectos.', values };
    }
    await startSession(outcome.user);
    // Solo se respeta `next` si es una ruta propia y el rol puede verla.
    const next = safeNextPath(formData.get('next'));
    const allowed =
      next &&
      (next === '/'
        ? can(outcome.user.role, 'reports:read')
        : NEXT_PERMISSIONS.some(([prefix, perm]) => next.startsWith(prefix) && can(outcome.user.role, perm)));
    target = allowed ? next : homeFor(outcome.user.role);
  } catch (err) {
    if (err instanceof SessionConfigError || err instanceof AdminUsersConfigError) {
      log('error', 'admin_config_error', { error: err.message });
      return { status: 'error', message: 'El panel no está configurado correctamente. Revisa los registros del servidor.' };
    }
    throw err;
  }
  redirect(target);
}
