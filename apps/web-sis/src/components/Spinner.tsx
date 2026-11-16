import { cn } from '@/lib/cn';

interface SpinnerProps {
  label?: string;
  className?: string;
}

/** Indicador indeterminado accesible (elemento <progress> sin valor). */
export function Spinner({ label = 'Cargando', className }: SpinnerProps) {
  return <progress aria-label={label} className={cn('spinner', className)} />;
}
