'use client';

import type { Promotion, Specialty } from '@capsur/api-contracts';
import { Tag } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useId, useMemo, useState } from 'react';
import { LeadForm } from '@/components/LeadForm';
import { PromotionPicker } from '@/components/PromotionPicker';
import { SpecialtyPicker } from '@/components/SpecialtyPicker';
import type { SubmitLeadResult } from '@/lib/api-client';
import { LEAD_REGISTERED_EVENT } from '@/lib/events';
import { loadDraft, recallLastLead, rememberLead } from '@/lib/session-store';
import { eligibleSpecialties, reconcileSelection } from '@/lib/specialty-selection';
import { track } from '@/lib/tracking';

/* B23: la confirmación (y su sondeo de estado) solo se descarga tras registrar. */
const LeadConfirmation = dynamic(() => import('@/components/LeadConfirmation').then((m) => m.LeadConfirmation), {
  loading: () => <p className="text-ink-600">Cargando tu confirmación…</p>,
});




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
 * preseleccionada; tras registrar la solicitud el selector se bloquea y la
 * tarjeta del formulario muestra los estados verificables.
 */
export function LeadCapture({ promotions, specialties, initialPromotionId = null }: LeadCaptureProps) {
  const errorId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(() => defaultPromotionId(promotions, initialPromotionId));
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [specialtyError, setSpecialtyError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitLeadResult | null>(null);

  const selected = promotions.find((p) => p.id === selectedId) ?? null;
  const eligible = useMemo(() => (selected ? eligibleSpecialties(selected, specialties) : []), [selected, specialties]);

  /* Restauración tras hidratar: sessionStorage no existe en el servidor, así
     que no puede formar parte del estado inicial sin romper la hidratación. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    track('landing_viewed', initialPromotionId ? { promotionId: initialPromotionId } : {});
    // A15: si ya registró en esta sesión, se restaura la confirmación.
    const last = recallLastLead();
    if (last) {
      setResult({ response: last.response, created: last.created });
      setSelectedId(last.response.promotion.id);
      // Diferido: el CTA flotante (hermano posterior) registra su escucha después de este efecto.
      window.setTimeout(() => window.dispatchEvent(new Event(LEAD_REGISTERED_EVENT)), 0);
      return;
    }
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
    setSpecialtyError(null);
    const promo = promotions.find((p) => p.id === promotionId);
    if (promo) {
      setSpecialtyIds((ids) => reconcileSelection(ids, eligibleSpecialties(promo, specialties), promo.bundle.specialtiesIncluded));
    }
    track('promotion_selected', { promotionId });
  };

  const onSpecialtiesChange = (ids: string[]) => {
    setSpecialtyIds(ids);
    setSpecialtyError(null);
  };

  const onSuccess = (r: SubmitLeadResult) => {
    rememberLead({ response: r.response, created: r.created, specialtyIds });
    setResult(r);
    window.dispatchEvent(new Event(LEAD_REGISTERED_EVENT));
  };

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
              locked={result !== null}
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
              locked={result !== null}
              errorMessage={specialtyError}
            />
          )}
        </div>

        <div
          id="catalogo"
          className="min-w-0 scroll-mt-24 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60"
        >
          {result ? (
            <LeadConfirmation response={result.response} alreadyRegistered={!result.created && !result.response.replayed} />
          ) : (
            <LeadForm
              promotion={selected}
              specialtyIds={specialtyIds}
              onSuccess={onSuccess}
              onPromotionUnavailable={() => setPromoError('Esta promoción ya no está disponible. Elige otra.')}
              onMissingPromotion={() => setPromoError('Elige una promoción para continuar.')}
              onSpecialtyError={setSpecialtyError}
            />
          )}
        </div>
      </div>
    </section>
  );
}
