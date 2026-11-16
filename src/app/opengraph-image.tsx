import { ImageResponse } from 'next/og';
import { OG_SIZE, OgFrame } from '@/lib/og';

export const alt = 'IEST Privado Sistemas del Sur: especialidades con Inteligencia Artificial';
export const size = OG_SIZE;
export const contentType = 'image/png';

/** Imagen Open Graph general (A24). */
export default function OpenGraphImage() {
  return new ImageResponse(
    <OgFrame eyebrow="Especialidades con IA" title="Tu experiencia," highlight="al siguiente nivel." footer="Catálogo por WhatsApp" />,
    size,
  );
}
