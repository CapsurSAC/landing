import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Panel CAPSUR', template: '%s · Panel CAPSUR' },
  description: 'Panel interno de GRUPO CAPSUR (Sistemas del Sur).',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  themeColor: '#061737',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Todo el panel se renderiza por petición: la CSP usa un nonce distinto en cada respuesta.
  await connection();
  return (
    <html lang="es-PE">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
