'use client';

import type { Promotion, Specialty } from '@capsur/api-contracts';
import { Tag } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { LeadForm } from '@/components/LeadForm';
import { PromotionPicker } from '@/components/PromotionPicker';
import { SpecialtyPicker } from '@/components/SpecialtyPicker';
import { loadDraft } from '@/lib/session-store';
import { eligibleSpecialties, reconcileSelection } from '@/lib/specialty-selection';
import { track } from '@/lib/tracking';

interface LeadCaptureProps {
  promotions: Promotion[];
  specialties: Specialty[];
  /** Promoción preseleccionada por `?promo=` o por /promociones/[id] (A30). */
  initialPromotionId?: string | null;
}

function defaultPromotionId(promotions: Promotion[], requested?: string | null): string | null {
  if (requested && promotions.some((p) => p.id === requested)) return requested;
  return promotions.find((p) => p.featured)?.id ?? promotions[0]?.id ?? null;
}

/**
 * Dos tarjetas lado a lado: selección de promoción (con sus especialidades) y
 * formulario. La promoción destacada (o la de la campaña) viene
 * preseleccionada; al enviar se abre WhatsApp con la solicitud.
 */
export function LeadCapture({ promotions, specialties, initialPromotionId = null }: LeadCaptureProps) {
  const errorId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(() => defaultPromotionId(promotions, initialPromotionId));
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [promoError, setPromoError] = useState<string | null>(null);

  const selected = promotions.find((p) => p.id === selectedId) ?? null;
  const eligible = useMemo(() => (selected ? eligibleSpecialties(selected, specialties) : []), [selected, specialties]);

  /* Restauración tras hidratar: sessionStorage no existe en el servidor, así
     que no puede formar parte del estado inicial sin romper la hidratación. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    track('landing_viewed', initialPromotionId ? { promotionId: initialPromotionId } : {});
    const draft = loadDraft();
    if (draft) {
      // La promoción de la campaña (?promo=) manda sobre la del borrador.
      const promoId = initialPromotionId ? selectedId : (defaultPromotionId(promotions, draft.promotionId) ?? selectedId);
      const promo = promotions.find((p) => p.id === promoId);
      setSelectedId(promoId);
      if (promo) {
        setSpecialtyIds(reconcileSelection(draft.specialtyIds, eligibleSpecialties(promo, specialties), promo.bundle.specialtiesIncluded));
      }
    }
    // Solo al montar: restauración de la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onSelect = (promotionId: string) => {
    setSelectedId(promotionId);
    setPromoError(null);
    const promo = promotions.find((p) => p.id === promotionId);
    if (promo) {
      setSpecialtyIds((ids) => reconcileSelection(ids, eligibleSpecialties(promo, specialties), promo.bundle.specialtiesIncluded));
    }
    track('promotion_selected', { promotionId });
  };

  const onSpecialtiesChange = (ids: string[]) => setSpecialtyIds(ids);

  return (
    <section id="promociones" className="scroll-mt-20">
      <div className="container-x grid grid-cols-1 gap-4 py-6 lg:grid-cols-[1.25fr_1fr] lg:items-stretch lg:py-6">
        <div className="min-w-0 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60">
          <div className="flex items-start gap-3">
            <Tag className="mt-0.5 size-8 shrink-0 -rotate-90 text-brand-500" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <h2 className="text-2xl leading-tight font-extrabold text-ink-900 sm:text-[1.75rem]">Elige tu promoción</h2>
              <p className="mt-1 text-pretty text-[0.95rem] text-ink-600">Accede a nuestras especialidades con beneficios exclusivos.</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-mist-50 p-3">
            <PromotionPicker
              promotions={promotions}
              selectedId={selectedId}
              onSelect={onSelect}
              errorMessage={promoError}
              errorId={errorId}
            />
          </div>
          {selected && eligible.length > 0 && (
            <SpecialtyPicker
              promotion={selected}
              specialties={specialties}
              selectedIds={specialtyIds}
              onChange={onSpecialtiesChange}
            />
          )}
        </div>

        <div
          id="catalogo"
          className="min-w-0 scroll-mt-24 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60"
        >
          <LeadForm
            promotion={selected}
            specialtyIds={specialtyIds}
            specialtyNames={specialtyIds.map((sid) => specialties.find((s) => s.id === sid)?.name ?? sid)}
            onMissingPromotion={() => setPromoError('Elige una promoción para continuar.')}
          />
        </div>
      </div>
    </section>
  );
}
