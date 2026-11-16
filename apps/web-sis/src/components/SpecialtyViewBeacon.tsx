'use client';

import { useEffect } from 'react';
import { track } from '@/lib/tracking';

/** Registra `specialty_viewed` al abrir /especialidades/[slug]. No renderiza nada. */
export function SpecialtyViewBeacon({ specialtyId }: { specialtyId: string }) {
  useEffect(() => {
    track('specialty_viewed', { specialtyId });
  }, [specialtyId]);
  return null;
}
