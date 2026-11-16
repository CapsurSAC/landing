'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { track } from '@/lib/tracking';

/**
 * Registra `faq_opened` cuando se abre una pregunta. El evento `toggle` no
 * burbujea, así que se escucha en fase de captura sobre el contenedor.
 */
export function FaqTracker({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      if (e.target instanceof HTMLDetailsElement && e.target.open) track('faq_opened');
    };
    el.addEventListener('toggle', onToggle, true);
    return () => el.removeEventListener('toggle', onToggle, true);
  }, []);
  return <div ref={ref}>{children}</div>;
}
