import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Sello de respaldo (A12). Solo el Colegio de Ingenieros del Perú – CD Tacna,
 * documentado en los brochures. No se usa el logotipo del CIP sin autorización:
 * es un sello tipográfico con el sistema visual de la marca.
 */
export function EndorsementSeal({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2.5 rounded-2xl px-3.5 py-2 text-[0.8rem] leading-snug',
        tone === 'light' ? 'bg-white text-ink-700 ring-1 ring-mist-200' : 'bg-white/10 text-white/90 ring-1 ring-white/20',
        className,
      )}
      data-testid="endorsement-seal"
    >
      <BadgeCheck className={cn('size-6 shrink-0', tone === 'light' ? 'text-brand-500' : 'text-cyan-400')} aria-hidden="true" />
      <span>
        Con respaldo del <strong className={tone === 'light' ? 'text-ink-900' : 'text-white'}>Colegio de Ingenieros del Perú</strong>
        <span className="block">Consejo Departamental de Tacna</span>
      </span>
    </p>
  );
}
