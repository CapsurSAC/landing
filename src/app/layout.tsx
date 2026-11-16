import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { siteConfig } from '@/lib/config';
import { HERO_EXPERIMENT_SCRIPT } from '@/lib/experiments';
import { getNonce } from '@/lib/nonce';
import './globals.css';

/* Subconjunto latino de Montserrat (B2), generado con scripts/subset-font.mjs. */
const montserrat = localFont({
  src: './fonts/Montserrat-latin.woff2',
  variable: '--font-montserrat',
  weight: '300 800',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: 'Especialidades con IA | IEST Privado Sistemas del Sur',
    template: '%s | IEST Privado Sistemas del Sur',
  },
  description:
    'Potencia tu formación técnica con herramientas de Inteligencia Artificial. Elige tu promoción y recibe el catálogo de especialidades por WhatsApp.',
  applicationName: 'Sistemas del Sur',
  keywords: ['especialidades con IA', 'instituto', 'Sistemas del Sur', 'SIS', 'formación técnica', 'Perú'],
  // La imagen Open Graph la genera app/opengraph-image.tsx (A24); cada página fija su canónica.
  openGraph: {
    type: 'website',
    locale: 'es_PE',
    siteName: 'IEST Privado Sistemas del Sur',
    title: 'Tu experiencia, al siguiente nivel',
    description: 'Especialidades con Inteligencia Artificial. Recibe el catálogo por WhatsApp.',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tu experiencia, al siguiente nivel',
    description: 'Especialidades con Inteligencia Artificial. Recibe el catálogo por WhatsApp.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#061737',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Leer el nonce hace dinámico el renderizado (requisito de la CSP con nonce);
  // los datos del catálogo siguen en la caché de datos con la etiqueta `catalog`.
  const nonce = await getNonce();
  return (
    // suppressHydrationWarning: el script del experimento añade un atributo a <html> antes de hidratar.
    <html lang="es-PE" className={montserrat.variable} suppressHydrationWarning>
      <head>
        {siteConfig.experimentsEnabled && <script nonce={nonce} dangerouslySetInnerHTML={{ __html: HERO_EXPERIMENT_SCRIPT }} />}
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
