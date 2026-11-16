'use client';

import type { Promotion } from '@capsur/api-contracts';
import { Check, Gift, Layers, Layers2 } from 'lucide-react';
import { useId, useRef, type ComponentType, type KeyboardEvent, type SVGProps } from 'react';
import { cn } from '@/lib/cn';
import { formatDayMonth } from '@/lib/format';

const ICONS: Record<Promotion['icon'], ComponentType<SVGProps<SVGSVGElement>>> = {
  gift: Gift,
  layers: Layers,
  stack: Layers2,
};

interface PromotionPickerProps {
  promotions: Promotion[];
  selectedId: string | null;
  onSelect: (promotionId: string) => void;
  locked?: boolean;
  errorMessage?: string | null;
  errorId?: string;
}

/**
 * Grupo de tarjetas con semántica de radio: una sola selección, flechas para
 * moverse, Enter/Espacio para elegir. La tarjeta seleccionada lleva el
 * degradado azul y la insignia de verificación del diseño.
 */
export function PromotionPicker({ promotions, selectedId, onSelect, locked = false, errorMessage, errorId }: PromotionPickerProps) {
  const groupId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + promotions.length) % promotions.length;
    const target = promotions[next];
    if (!target) return;
    onSelect(target.id);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (locked) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, -1);
    }
  };

  return (
    <div>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        aria-describedby={errorMessage && errorId ? errorId : undefined}
        aria-disabled={locked || undefined}
        className="grid grid-cols-3 gap-2.5 sm:gap-3"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
      >
        <span id={`${groupId}-label`} className="visually-hidden">
          Promoción
        </span>
        {promotions.map((promo, index) => {
          const selected = promo.id === selectedId;
          const Icon = ICONS[promo.icon] ?? Layers;
          return (
            <button
              key={promo.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (selectedId === null && index === 0) ? 0 : -1}
              disabled={locked && !selected}
              onClick={() => !locked && onSelect(promo.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              data-testid={`promo-${promo.id}`}
              className={cn(
                'group relative flex min-h-40 min-w-0 flex-col items-center justify-center rounded-[var(--radius-card)] px-2 py-4 text-center break-words transition-[transform,box-shadow,background-color] duration-300 ease-[var(--ease-out-soft)] sm:min-h-[10.5rem] sm:px-2',
                selected
                  ? 'selected-gradient scale-[1.03] text-white shadow-[var(--shadow-selected)]'
                  : 'bg-white text-ink-900 shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-20px_rgb(0,48,144,0.4)]',
                locked && !selected && 'opacity-50',
              )}
            >
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute right-2.5 top-2.5 inline-flex size-6 items-center justify-center rounded-full bg-white text-brand-600 shadow-md sm:size-7"
                >
                  <Check className="size-4" strokeWidth={3} />
                </span>
              )}
              <Icon
                className={cn('size-8 sm:size-10', selected ? 'text-white' : 'text-brand-500')}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="mt-2.5 text-[0.9rem] font-extrabold leading-tight sm:text-[1.1rem]">{promo.name}</span>
              <span className="mt-0.5 text-xl font-extrabold tracking-tight sm:text-[1.9rem]">{promo.headline}</span>
              <span className={cn('mt-1 text-[0.78rem] font-medium sm:text-[0.9rem]', selected ? 'text-white/85' : 'text-ink-600')}>
                {promo.bundle.label}
              </span>
              {/* A13: vigencia real del catálogo; sin fecha de fin no se muestra nada. */}
              {promo.validUntil && (
                <span
                  className={cn('mt-1 text-[0.7rem] font-semibold leading-tight sm:text-[0.75rem]', selected ? 'text-cyan-200' : 'text-brand-600')}
                  data-testid={`promo-valid-until-${promo.id}`}
                >
                  Válida hasta el {formatDayMonth(promo.validUntil)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {errorMessage && errorId && (
        <p id={errorId} className="error-msg">
          <span aria-hidden="true">⚠</span>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
