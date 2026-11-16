import { Check, Gift, Layers, Layers2 } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/cn';

const ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  gift: Gift,
  layers: Layers,
  stack: Layers2,
};

export interface PreviewPromotion {
  id: string;
  name: string;
  headline: string;
  bundleLabel: string;
  icon: string;
}

/**
 * Réplica de la tarjeta de `apps/web-sis/src/components/PromotionPicker.tsx`
 * (mismas clases, degradado y sombras) para previsualizar los cambios.
 */
export function PromotionCard({ promo, selected }: { promo: PreviewPromotion; selected: boolean }) {
  const Icon = ICONS[promo.icon] ?? Layers;
  return (
    <div
      className={cn(
        'relative flex min-h-40 min-w-0 flex-col items-center justify-center rounded-[var(--radius-card)] px-2 py-4 text-center break-words sm:min-h-[10.5rem]',
        selected ? 'selected-gradient scale-[1.03] text-white shadow-[var(--shadow-selected)]' : 'bg-white text-ink-900 shadow-[var(--shadow-card)]',
      )}
    >
      {selected && (
        <span
          aria-hidden="true"
          className="absolute top-2.5 right-2.5 inline-flex size-6 items-center justify-center rounded-full bg-white text-brand-600 shadow-md sm:size-7"
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
      )}
      <Icon className={cn('size-8 sm:size-10', selected ? 'text-white' : 'text-brand-500')} strokeWidth={1.75} aria-hidden="true" />
      <span className="mt-2.5 text-[0.9rem] leading-tight font-extrabold sm:text-[1.1rem]">{promo.name || 'Nombre'}</span>
      <span className="mt-0.5 text-xl font-extrabold tracking-tight sm:text-[1.9rem]">{promo.headline || 'S/—'}</span>
      <span className={cn('mt-1 text-[0.78rem] font-medium sm:text-[0.9rem]', selected ? 'text-white/85' : 'text-ink-600')}>
        {promo.bundleLabel || '—'}
      </span>
    </div>
  );
}

/** Fila de tarjetas como en la landing (3 columnas) con la promoción editada seleccionada. */
export function PromotionPreviewRow({ current, others }: { current: PreviewPromotion; others: PreviewPromotion[] }) {
  const cards = [current, ...others].slice(0, 3);
  return (
    <div className="rounded-xl bg-mist-50 p-4" data-testid="promotion-preview">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {cards.map((p, i) => (
          <PromotionCard key={i === 0 ? '__current' : p.id} promo={p} selected={i === 0} />
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-500">
        La tarjeta editada aparece seleccionada. El orden real en la landing depende de «Orden» y de las demás promociones vigentes.
      </p>
    </div>
  );
}
