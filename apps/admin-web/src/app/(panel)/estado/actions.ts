'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/lib/action-state';
import { retryIntegrations, type RetryResult } from '@/lib/server/api';
import { authorizeAction } from '@/lib/server/auth';
import { audit } from '@/lib/server/log';

/** Reprocesa primero los trabajos FAILED y después los DEAD (A27, C24). */
export async function retryFailedAction(_prev: ActionState): Promise<ActionState> {
  const auth = await authorizeAction('status:retry');
  if (!auth.ok) return { status: 'error', message: auth.error };

  const outcome: Partial<Record<'FAILED' | 'DEAD', RetryResult>> = {};
  for (const status of ['FAILED', 'DEAD'] as const) {
    const result = await retryIntegrations(status, auth.user.email);
    if (!result.ok) {
      audit('admin.integrations.retry', auth.user.email, { outcome, failedAt: status });
      return {
        status: 'error',
        message: `${result.error.message}${outcome.FAILED ? ` (FAILED ya procesados: ${outcome.FAILED.attempted})` : ''}`,
      };
    }
    outcome[status] = result.data;
  }
  audit('admin.integrations.retry', auth.user.email, { outcome });
  revalidatePath('/estado');
  const f = outcome.FAILED!;
  const d = outcome.DEAD!;
  const attempted = f.attempted + d.attempted;
  return {
    status: 'success',
    message:
      attempted === 0
        ? 'No había trabajos fallidos que reprocesar.'
        : `Reprocesados ${attempted}: ${f.succeeded + d.succeeded} correctos y ${f.failed + d.failed} siguen fallando (FAILED ${f.attempted}, DEAD ${d.attempted}).`,
  };
}
