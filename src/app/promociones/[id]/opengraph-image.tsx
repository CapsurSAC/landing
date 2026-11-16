import { ImageResponse } from 'next/og';
import { getPromotions } from '@/lib/catalog';
import { fallbackPromotions } from '@/lib/fallback-catalog';
import { OG_SIZE, OgFrame, OgPriceCard } from '@/lib/og';

export const alt = 'Promoción de IEST Privado Sistemas del Sur';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
  return fallbackPromotions.map((p) => ({ id: p.id }));
}

/** Imagen Open Graph por promoción (A24): nombre, precio y qué incluye, desde el catálogo. */
export default async function PromotionOgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { items } = await getPromotions();
  const promotion = items.find((p) => p.id === id);
  if (!promotion) {
    return new ImageResponse(
      <OgFrame eyebrow="Especialidades con IA" title="Tu experiencia," highlight="al siguiente nivel." footer="Catálogo por WhatsApp" />,
      size,
    );
  }
  return new ImageResponse(
    <OgFrame
      eyebrow="Promoción"
      title="Especialidades"
      highlight="con IA, 100% virtual."
      footer="Elige tu promoción"
      badge={<OgPriceCard name={promotion.name} headline={promotion.headline} label={promotion.bundle.label} />}
    />,
    size,
  );
}
