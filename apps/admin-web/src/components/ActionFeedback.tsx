import type { ActionState } from '@/lib/action-state';
import { Notice } from './ui';

/** Mensaje de resultado de una acción de servidor (región viva para lectores de pantalla). */
export function ActionFeedback({ state, className }: { state: ActionState; className?: string }) {
  if (state.status === 'idle' || !state.message) return null;
  return (
    <Notice tone={state.status === 'success' ? 'success' : 'error'} className={className}>
      {state.message}
    </Notice>
  );
}
