/** Estado que devuelven las acciones de servidor a sus formularios (useActionState). */
export interface ActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Valores no sensibles para repoblar el formulario tras el reinicio automático de React 19. */
  values?: Record<string, string>;
}

export const IDLE: ActionState = { status: 'idle' };
