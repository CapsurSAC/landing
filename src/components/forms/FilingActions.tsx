'use client';

import { Printer } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { siteConfig } from '@/lib/config';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

/** Copia completa de la hoja y botones para enviarla por WhatsApp o imprimirla. */
export function FilingActions({ message }: { message: string }) {
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={buildWhatsAppUrl(siteConfig.whatsappNumber, message)}
          target="_blank"
          rel="noopener noreferrer"
          className="wa-gradient inline-flex min-h-12 items-center justify-center gap-2.5 rounded-2xl px-5 font-bold text-white shadow-[var(--shadow-cta)]"
          data-testid="filing-whatsapp"
        >
          <WhatsAppIcon className="size-6" />
          Enviar por WhatsApp
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-2xl border border-mist-200 bg-white px-5 font-bold text-ink-900 hover:border-brand-400"
        >
          <Printer className="size-5" aria-hidden="true" />
          Imprimir o guardar PDF
        </button>
      </div>
      <pre className="overflow-x-auto rounded-2xl bg-mist-50 p-4 font-sans text-[0.88rem] whitespace-pre-wrap text-ink-900">{message}</pre>
    </div>
  );
}
