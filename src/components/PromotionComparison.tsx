'use client';

import type { Promotion, Specialty } from '@capsur/api-contracts';
import { ChevronDown, Scale } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';

/* B23: la tabla se descarga solo cuando el usuario abre el comparador. */
const PromotionComparisonTable = dynamic(
  () => import('@/components/PromotionComparisonTable').then((m) => m.PromotionComparisonTable),
  { loading: () => <p className="mt-4 text-sm text-ink-600">Cargando comparación…</p> },
);

interface PromotionComparisonProps {
  promotions: Promotion[];
  specialties: Specialty[];
}

/** Bloque compacto «Compara las promociones» que despliega la tabla (A26). */
export function PromotionComparison({ promotions, specialties }: PromotionComparisonProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (promotions.length < 2) return null;

  return (
    <section aria-labelledby={`${id}-title`} className="pb-7 sm:pb-8">
      <div className="container-x">
        <div className="rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-mist-100 text-brand-500">
              <Scale className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <h2 id={`${id}-title`} className="text-[1.05rem] font-extrabold leading-snug text-ink-900">
                ¿Cuál te conviene?
              </h2>
              <p className="text-[0.85rem] text-ink-600">Compara qué incluye cada promoción.</p>
            </div>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`${id}-panel`}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border sm:w-auto border-brand-500 px-4 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-500 hover:text-white"
              data-testid="compare-toggle"
            >
              {open ? 'Ocultar comparación' : 'Comparar promociones'}
              <ChevronDown className={cn('size-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
            </button>
          </div>
          <div id={`${id}-panel`} hidden={!open}>
            {open && <PromotionComparisonTable promotions={promotions} specialties={specialties} />}
          </div>
        </div>
      </div>
    </section>
  );
}
