'use client';

import type { CreateLeadResponse } from '@capsur/api-contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LeadConfirmation } from '@/components/LeadConfirmation';
import { Spinner } from '@/components/Spinner';
import { fetchLeadStatus } from '@/lib/api-client';
import { siteConfig } from '@/lib/config';
import { recallLeadResponse } from '@/lib/session-store';
import { buildWhatsAppMessage, buildWhatsAppUrl } from '@/lib/whatsapp';

type State = { kind: 'loading' } | { kind: 'ready'; response: CreateLeadResponse } | { kind: 'missing' };

/** Token de estado opcional en el fragmento (#token=…): nunca viaja al servidor en la URL. */
function tokenFromHash(): string | null {
  const match = /(?:^#|&)token=([A-Za-z0-9_-]{16,})/.exec(window.location.hash);
  return match?.[1] ?? null;
}

/**
 * Reconstruye la vista de confirmación. Si la respuesta original está en la
 * sesión la reutiliza; si no, consulta el estado con el token firmado (C18)
 * y arma un enlace de WhatsApp genérico con el código de referencia.
 */
export function LeadStatusView({ leadId }: { leadId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<State> => {
      const remembered = recallLeadResponse(leadId);
      if (remembered) return { kind: 'ready', response: remembered };
      const token = tokenFromHash();
      if (!token) return { kind: 'missing' };
      const status = await fetchLeadStatus(leadId, token);
      const message = buildWhatsAppMessage({
        brandName: siteConfig.brandName,
        promotionName: 'la promoción elegida en la web',
        promotionHeadline: 'ver catálogo',
        reference: status.reference,
      });
      return {
        kind: 'ready',
        response: {
          leadId: status.leadId,
          reference: status.reference,
          status: status.status,
          phone: '+10000000000',
          campus: 'tacna',
          promotion: { id: 'con-ia', name: 'elegida en la web', headline: '' },
          specialties: [],
          whatsapp: {
            number: siteConfig.whatsappNumber,
            prefilledMessage: message,
            url: buildWhatsAppUrl(siteConfig.whatsappNumber, message),
          },
          statusToken: token,
          replayed: false,
        },
      };
    };
    load()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'missing' });
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (state.kind === 'loading') {
    return (
      <p className="flex items-center gap-3 text-ink-600">
        <Spinner label="Buscando tu solicitud" className="text-brand-500" />
        Buscando tu solicitud…
      </p>
    );
  }
  if (state.kind === 'missing') {
    return (
      <div>
        <h1 className="text-2xl font-extrabold text-ink-900">No encontramos esta solicitud</h1>
        <p className="mt-2 text-ink-600">
          El enlace puede estar incompleto o haber expirado. Si ya te registraste, escríbenos por WhatsApp con tu código de solicitud.
        </p>
        <Link href="/#catalogo" className="mt-5 inline-flex rounded-full bg-brand-500 px-5 py-2.5 font-semibold text-white hover:bg-brand-600">
          Volver al formulario
        </Link>
      </div>
    );
  }
  return <LeadConfirmation response={state.response} showSurvey={false} />;
}
