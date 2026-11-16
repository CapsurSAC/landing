'use client';

import { FileText, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LEAD_REGISTERED_EVENT } from '@/lib/events';
import { siteConfig } from '@/lib/config';
import { track } from '@/lib/tracking';

/**
 * Barra flotante solo para móvil (A14 + A22):
 * - «Solicitar catálogo» lleva al formulario. Se muestra solo cuando el
 *   formulario y el pie están fuera de pantalla (IntersectionObserver) y
 *   desaparece cuando ya hay una solicitud registrada.
 * - «Llamar» abre la central telefónica (tel:).
 * Respeta `prefers-reduced-motion` (sin desplazamiento animado) y no tapa el
 * pie de página porque se oculta cuando este entra en pantalla.
 */
export function MobileActions({ targetId, fallbackHref }: { targetId?: string; fallbackHref?: string }) {
  // Sin formulario en la página (targetId vacío) la barra se muestra hasta llegar al pie.
  const [targetVisible, setTargetVisible] = useState(Boolean(targetId));
  const [footerVisible, setFooterVisible] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    const target = targetId ? document.getElementById(targetId) : null;
    const footer = document.querySelector('footer');
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === target) setTargetVisible(entry.isIntersecting);
        if (entry.target === footer) setFooterVisible(entry.isIntersecting);
      }
    });
    if (target) observer.observe(target);
    if (footer) observer.observe(footer);
    const onRegistered = () => setRegistered(true);
    window.addEventListener(LEAD_REGISTERED_EVENT, onRegistered);
    return () => {
      observer.disconnect();
      window.removeEventListener(LEAD_REGISTERED_EVENT, onRegistered);
    };
  }, [targetId]);

  const show = !targetVisible && !footerVisible;

  const goToForm = () => {
    track('floating_cta_clicked');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) {
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      // Lleva el foco al primer campo para lectores de pantalla y teclado.
      target.querySelector<HTMLElement>('input:not([type=hidden]):not([tabindex="-1"]), a, button')?.focus({ preventScroll: true });
    } else {
      window.location.assign(fallbackHref ?? '/#catalogo');
    }
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      data-testid="mobile-actions"
    >
      <div
        className={
          'pointer-events-auto mx-auto flex max-w-md items-center gap-2 transition-[opacity,translate] duration-300 ease-[var(--ease-out-soft)] motion-reduce:transition-none ' +
          (show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0')
        }
        aria-hidden={!show}
        inert={!show}
      >
        {!registered && (
          <button
            type="button"
            onClick={goToForm}
            className="wa-gradient inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 text-[0.95rem] font-bold text-white shadow-[var(--shadow-cta)]"
            data-testid="floating-cta"
          >
            <FileText className="size-5" aria-hidden="true" />
            Solicitar catálogo
          </button>
        )}
        <a
          href={siteConfig.phone.href}
          onClick={() => track('call_clicked')}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-navy-950 px-5 text-[0.95rem] font-bold text-white shadow-[0_14px_30px_-12px_rgb(0,0,0,0.5)]"
          aria-label={`Llamar a la central ${siteConfig.phone.display}`}
          data-testid="call-button"
        >
          <Phone className="size-5" aria-hidden="true" />
          Llamar
        </a>
      </div>
    </div>
  );
}
