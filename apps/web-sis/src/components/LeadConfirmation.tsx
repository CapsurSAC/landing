'use client';

import type { CreateLeadResponse, LeadStatus } from '@capsur/api-contracts';
import { ArrowRight, Check, Headset } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { Spinner } from '@/components/Spinner';
import { fetchLeadStatus } from '@/lib/api-client';
import { formatWhatsAppForDisplay } from '@/lib/config';
import { track } from '@/lib/tracking';

/* B23: la encuesta opcional solo se descarga tras registrar. */
const FeedbackSurvey = dynamic(() => import('@/components/FeedbackSurvey').then((m) => m.FeedbackSurvey), {
  ssr: false,
  loading: () => null,
});

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // ~1 minuto

type CrmView = 'pending' | 'synced' | 'unknown';

interface LeadConfirmationProps {
  response: CreateLeadResponse;
  /** Si la solicitud ya existía (duplicado o reintento), lo decimos tal cual. */
  alreadyRegistered?: boolean;
  /** Muestra la pregunta opcional «¿Cómo nos conociste?» (A21). */
  showSurvey?: boolean;
}

/**
 * Estados verificables tras el registro. No hay barras de progreso simuladas:
 * "Solicitud registrada" es un hecho confirmado por el backend, "Continuar por
 * WhatsApp" es la acción del usuario y el estado del CRM proviene de eventos
 * reales consultados al servicio de leads con el token firmado (C18).
 */
export function LeadConfirmation({ response, alreadyRegistered = false, showSurvey = true }: LeadConfirmationProps) {
  // Sin token no se puede consultar el estado: se informa que la solicitud está guardada.
  const [crm, setCrm] = useState<CrmView>(response.statusToken ? toView(response.status) : 'unknown');

  useEffect(() => {
    if (crm !== 'pending' || !response.statusToken) return;
    let attempts = 0;
    let cancelled = false;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const status = await fetchLeadStatus(response.leadId, response.statusToken);
        if (cancelled) return;
        const view = toView(status.status);
        if (view !== 'pending') {
          setCrm(view);
          clearInterval(timer);
          return;
        }
      } catch {
        // la consulta de estado es informativa; seguimos intentando hasta el límite
      }
      if (attempts >= POLL_MAX_ATTEMPTS) {
        clearInterval(timer);
        if (!cancelled) setCrm('unknown');
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [crm, response.leadId, response.statusToken]);

  return (
    <div className="flex flex-col gap-5" data-testid="lead-confirmation">
      <div className="flex items-start gap-4">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-wa-500/15 text-wa-700">
          <Check className="size-7" strokeWidth={3} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold leading-tight text-ink-900">
            {alreadyRegistered ? 'Tu solicitud ya estaba registrada' : 'Solicitud registrada'}
          </h2>
          <p className="mt-1 text-pretty text-ink-600">
            Guardamos tus datos y la promoción <strong className="font-semibold text-ink-900">{response.promotion.name}</strong>.
            Tu código de solicitud es{' '}
            <code className="rounded-md bg-mist-100 px-1.5 py-0.5 font-semibold text-brand-700">{response.reference}</code>.
          </p>
          {response.specialties.length > 0 && (
            <p className="mt-1 text-pretty text-sm text-ink-600">
              Especialidades: <span className="font-semibold text-ink-900">{response.specialties.map((s) => s.name).join(' y ')}</span>.
            </p>
          )}
        </div>
      </div>

      <a
        href={response.whatsapp.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('whatsapp_opened', { leadId: response.leadId, promotionId: response.promotion.id })}
        className="wa-gradient inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl px-6 text-base font-bold text-white shadow-[var(--shadow-cta)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
        data-testid="whatsapp-cta"
      >
        <WhatsAppIcon className="size-7" />
        Continuar por WhatsApp
        <ArrowRight className="size-5" aria-hidden="true" />
      </a>

      <p className="text-sm text-ink-600">
        Al abrir el chat verás un mensaje ya escrito con tu código. Envíalo y un asesor te responderá con el catálogo. Si no se abre, escríbenos
        al <span className="font-semibold text-ink-900">{formatWhatsAppForDisplay(response.whatsapp.number)}</span> indicando tu código.
      </p>

      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-2xl border border-mist-200 bg-mist-50 px-4 py-3 text-sm"
      >
        <Headset className="size-6 shrink-0 text-brand-500" aria-hidden="true" />
        {crm === 'pending' && (
          <>
            <span className="text-ink-700">Enviando tu solicitud a un asesor…</span>
            <Spinner label="Sincronizando con el equipo de asesores" className="ml-auto text-brand-500" />
          </>
        )}
        {crm === 'synced' && <span className="font-semibold text-ink-900">Un asesor ya tiene tu solicitud.</span>}
        {crm === 'unknown' && (
          <span className="text-ink-700">Tu solicitud está guardada. Te contactaremos aunque la conexión con el equipo tarde unos minutos.</span>
        )}
      </div>

      {showSurvey && response.statusToken && <FeedbackSurvey leadId={response.leadId} statusToken={response.statusToken} />}
    </div>
  );
}

function toView(status: LeadStatus): CrmView {
  if (status === 'crm_synced') return 'synced';
  if (status === 'crm_failed') return 'unknown';
  return 'pending';
}
