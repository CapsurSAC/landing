import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/labels';

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {backHref && (
          <Link href={backHref} className="link mb-1 inline-block text-sm">
            ← {backLabel ?? 'Volver'}
          </Link>
        )}
        <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={cn('card', className)} aria-labelledby={title ? headingId : undefined} id={id}>
      {title && (
        <div className="card-header">
          <h2 id={headingId} className="card-title">
            {title}
          </h2>
          {actions}
        </div>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone = 'neutral' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  const accent: Record<Tone, string> = {
    neutral: 'border-l-mist-200',
    info: 'border-l-brand-500',
    success: 'border-l-wa-600',
    warning: 'border-l-warning-700',
    danger: 'border-l-danger-600',
  };
  return (
    <div className={cn('card border-l-4 px-4 py-3', accent[tone])}>
      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('chip', `chip-${tone}`)}>{children}</span>;
}

const NOTICE_STYLE: Record<'info' | 'success' | 'error' | 'warning', { box: string; Icon: typeof Info }> = {
  info: { box: 'border-brand-300/60 bg-brand-50 text-brand-700', Icon: Info },
  success: { box: 'border-success-700/25 bg-success-50 text-success-700', Icon: CheckCircle2 },
  warning: { box: 'border-warning-700/25 bg-warning-50 text-warning-700', Icon: AlertTriangle },
  error: { box: 'border-danger-700/25 bg-danger-50 text-danger-700', Icon: XCircle },
};

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'success' | 'error' | 'warning';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = NOTICE_STYLE[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm', box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-ink-700')}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-ink-500">{children}</p>;
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Atributos ARIA para un control dentro de <Field>. */
export function fieldAria(id: string, error?: string, hint?: boolean) {
  return {
    id,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
}
