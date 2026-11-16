import type { Metadata } from 'next';
import { LandingView } from '@/components/LandingView';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Landing. Se renderiza por petición (CSP con nonce, C1); el catálogo sigue
 * cacheado en la caché de datos con la etiqueta `catalog` (B8).
 * `?promo=<id>` preselecciona la promoción desde anuncios (A30).
 */
export default async function LandingPage({ searchParams }: PageProps) {
  const { promo } = await searchParams;
  return <LandingView initialPromotionId={typeof promo === 'string' ? promo : null} />;
}
