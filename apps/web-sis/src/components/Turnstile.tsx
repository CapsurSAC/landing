'use client';

import { useEffect, useRef } from 'react';
import { siteConfig } from '@/lib/config';

/**
 * Widget de Cloudflare Turnstile (C3). Solo se monta si existe
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY. Usa `appearance: interaction-only`: no
 * ocupa espacio salvo que Cloudflare pida una interacción, así que el diseño
 * del formulario no cambia. El script se inserta con el nonce de la página
 * (CSP estricta con 'strict-dynamic').
 */

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loader: Promise<TurnstileApi> | null = null;

function pageNonce(): string | undefined {
  const withNonce = document.querySelector<HTMLScriptElement>('script[nonce]');
  return withNonce?.nonce || undefined;
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    const nonce = pageNonce();
    if (nonce) script.nonce = nonce;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile no disponible')));
    script.onerror = () => {
      loader = null;
      reject(new Error('No se pudo cargar Turnstile'));
    };
    document.head.appendChild(script);
  });
  return loader;
}

interface TurnstileProps {
  /** Recibe el token válido, o null si expiró o falló. */
  onToken: (token: string | null) => void;
  /** Cambia este valor para pedir un token nuevo (los tokens son de un solo uso). */
  resetSignal?: number;
  action?: string;
}

export function Turnstile({ onToken, resetSignal = 0, action }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteConfig.turnstileSiteKey || !containerRef.current) return;
    let cancelled = false;
    const el = containerRef.current;
    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetRef.current = api.render(el, {
          sitekey: siteConfig.turnstileSiteKey,
          action,
          language: 'es',
          appearance: 'interaction-only',
          size: 'flexible',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [action]);

  useEffect(() => {
    if (resetSignal > 0 && widgetRef.current && window.turnstile) {
      onTokenRef.current(null);
      window.turnstile.reset(widgetRef.current);
    }
  }, [resetSignal]);

  if (!siteConfig.turnstileSiteKey) return null;
  return <div ref={containerRef} className="empty:hidden" data-testid="turnstile" />;
}
