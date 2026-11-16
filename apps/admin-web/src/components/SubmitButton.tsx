'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/cn';

/** Botón de envío que se desactiva y anuncia el estado mientras la acción está en curso. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  className,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost-danger';
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-disabled={pending || undefined}
      className={cn('btn', `btn-${variant}`, className)}
    >
      {pending ? (pendingLabel ?? 'Procesando…') : children}
    </button>
  );
}
