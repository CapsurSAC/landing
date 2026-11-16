import type { ReactNode } from 'react';

/**
 * Campo con etiqueta visible, ayuda y error asociados por aria-describedby.
 * El control lo pasa el llamador (render prop) para no perder sus atributos.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string; required: boolean }) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[0.88rem] font-semibold text-ink-900">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger-600">
            {' '}
            *
          </span>
        ) : (
          <span className="font-normal text-ink-600"> (opcional)</span>
        )}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-[0.8rem] text-ink-600">
          {hint}
        </p>
      )}
      <div className="mt-1.5">{children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, required })}</div>
      {error && (
        <p id={`${id}-error`} className="error-msg">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      )}
    </div>
  );
}

/** Tarjeta de confirmación con código y fecha límite de respuesta. */
export function FiledConfirmation({
  title,
  code,
  receivedAt,
  dueBy,
  children,
}: {
  title: string;
  code: string;
  receivedAt: string;
  dueBy: string;
  children?: ReactNode;
}) {
  return (
    <div role="status" className="rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60" data-testid="filed-confirmation">
      <h2 className="text-xl font-extrabold text-ink-900">{title}</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-mist-50 p-4">
          <dt className="text-[0.8rem] font-semibold text-ink-600">Código</dt>
          <dd className="mt-1 font-mono text-lg font-bold text-brand-700" data-testid="filed-code">
            {code}
          </dd>
        </div>
        <div className="rounded-2xl bg-mist-50 p-4">
          <dt className="text-[0.8rem] font-semibold text-ink-600">Recibido</dt>
          <dd className="mt-1 font-bold text-ink-900">{receivedAt}</dd>
        </div>
        <div className="rounded-2xl bg-mist-50 p-4">
          <dt className="text-[0.8rem] font-semibold text-ink-600">Fecha límite de respuesta</dt>
          <dd className="mt-1 font-bold text-ink-900" data-testid="filed-due">
            {dueBy}
          </dd>
        </div>
      </dl>
      {children && <div className="mt-4 text-pretty text-[0.92rem] text-ink-700">{children}</div>}
    </div>
  );
}
