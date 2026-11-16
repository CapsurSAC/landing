'use client';

import { useEffect } from 'react';
import { siteConfig } from '@/lib/config';
import { HERO_COPY_EXPERIMENT } from '@/lib/experiments';
import { track } from '@/lib/tracking';

const EXPOSED_KEY = `sis.exp.${HERO_COPY_EXPERIMENT.id}.exposed`;

/**
 * Registra una sola vez por sesión el evento `experiment_exposed` del hero
 * (A18). `track` adjunta la variante leída de <html>. No renderiza nada.
 */
export function HeroExperimentBeacon() {
  useEffect(() => {
    if (!siteConfig.experimentsEnabled) return;
    try {
      if (window.sessionStorage.getItem(EXPOSED_KEY)) return;
      window.sessionStorage.setItem(EXPOSED_KEY, '1');
    } catch {
      // sin almacenamiento: se registra igualmente una vez por carga
    }
    track('experiment_exposed');
  }, []);
  return null;
}
