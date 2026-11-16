'use client';

import type { LeadFeedbackSource } from '@capsur/api-contracts';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { submitLeadFeedback } from '@/lib/api-client';
import { markFeedbackSent, wasFeedbackSent } from '@/lib/session-store';

const SOURCES: Array<{ value: LeadFeedbackSource; label: string }> = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'google', label: 'Google' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'recomendacion', label: 'Recomendación' },
  { value: 'colegio', label: 'Colegio' },
  { value: 'otro', label: 'Otro' },
];

type State = 'idle' | 'sending' | 'sent' | 'error' | 'dismissed';

/**
 * Pregunta opcional «¿Cómo nos conociste?» tras el registro (A21). No bloquea
 * nada: se puede ignorar u ocultar. Envía `x-lead-token` (C18).
 */
export function FeedbackSurvey({ leadId, statusToken }: { leadId: string; statusToken: string }) {
  const id = useId();
  const [source, setSource] = useState<LeadFeedbackSource | null>(null);
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    // Lectura de sessionStorage tras hidratar (no disponible en el servidor).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (wasFeedbackSent(leadId)) setState('dismissed');
  }, [leadId]);

  if (state === 'dismissed') return null;
  if (state === 'sent') {
    return (
      <p role="status" className="text-sm font-semibold text-ink-700" data-testid="feedback-thanks">
        ¡Gracias por contarnos!
      </p>
    );
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!source) return;
    setState('sending');
    try {
      const trimmed = detail.trim();
      await submitLeadFeedback(leadId, statusToken, { source, ...(trimmed ? { detail: trimmed.slice(0, 120) } : {}) });
      markFeedbackSent(leadId);
      setState('sent');
    } catch {
      setState('error');
    }
  };

  const needsDetail = source === 'otro' || source === 'recomendacion' || source === 'colegio';

  return (
    <form onSubmit={onSubmit} className="border-t border-mist-200 pt-4" aria-labelledby={`${id}-title`} data-testid="feedback-survey">
      <fieldset>
        <legend id={`${id}-title`} className="text-[0.9rem] font-bold text-ink-900">
          ¿Cómo nos conociste? <span className="font-normal text-ink-600">(opcional)</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <label key={s.value} className="choice-chip">
              <input
                type="radio"
                name={`${id}-source`}
                value={s.value}
                checked={source === s.value}
                onChange={() => setSource(s.value)}
                className="sr-only"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      {needsDetail && (
        <div className="mt-2">
          <label htmlFor={`${id}-detail`} className="text-[0.8rem] font-semibold text-ink-700">
            Cuéntanos un poco más (opcional)
          </label>
          <input
            id={`${id}-detail`}
            type="text"
            maxLength={120}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="field-area mt-1"
            autoComplete="off"
          />
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={!source || state === 'sending'}
          className="inline-flex min-h-10 items-center rounded-full bg-brand-500 px-5 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'sending' ? 'Enviando…' : 'Enviar'}
        </button>
        <button
          type="button"
          onClick={() => {
            markFeedbackSent(leadId);
            setState('dismissed');
          }}
          className="text-sm font-semibold text-ink-600 underline underline-offset-2 hover:text-ink-900"
        >
          No, gracias
        </button>
      </div>
      {state === 'error' && (
        <p role="alert" className="error-msg">
          No pudimos guardar tu respuesta. Puedes intentarlo otra vez o dejarlo así; tu solicitud ya está registrada.
        </p>
      )}
    </form>
  );
}
