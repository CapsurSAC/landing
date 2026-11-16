import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LandingView } from '@/components/LandingView';
import { getPromotions } from '@/lib/catalog';
import { siteConfig } from '@/lib/config';
import { fallbackPromotions } from '@/lib/fallback-catalog';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamicParams = true;
export function generateStaticParams() {
  return fallbackPromotions.map((p) => ({ id: p.id }));
}

async function findPromotion(id: string) {
  const { items } = await getPromotions();
  return items.find((p) => p.id === id) ?? null;
}

/** Metadatos propios por promoción (A30); la imagen OG la genera ./opengraph-image.tsx (A24). */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const promotion = await findPromotion(id);
  if (!promotion) return { title: 'Promoción no disponible', robots: { index: false } };
  const title = `Promoción ${promotion.name} · ${promotion.headline}`;
  const description = `${promotion.bundle.label} con ${promotion.headline}. Elige tus especialidades y recibe el catálogo por WhatsApp.`;
  return {
    title,
    description,
    alternates: { canonical: `/promociones/${promotion.id}` },
    openGraph: {
      type: 'website',
      locale: 'es_PE',
      siteName: siteConfig.legalName,
      title,
      description,
      url: `/promociones/${promotion.id}`,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** Misma landing con la promoción preseleccionada (enlaces de campaña). */
export default async function PromotionPage({ params }: PageProps) {
  const { id } = await params;
  const promotion = await findPromotion(id);
  if (!promotion) notFound();
  return <LandingView initialPromotionId={promotion.id} />;
}
