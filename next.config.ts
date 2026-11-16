import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './src/lib/security-headers';

const IS_HTTPS_PRODUCTION = process.env.NODE_ENV === 'production' && (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://');

/** B24: `pnpm analyze` genera los informes en .next/analyze (build con webpack). */
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true', openAnalyzer: false });

/**
 * Landing independiente: no hay backend. La CSP con nonce la fija
 * src/proxy.ts por petición; aquí van las cabeceras estáticas.
 */
const nextConfig: NextConfig = {
  // Salida standalone solo para la imagen Docker; `next start` no la admite.
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  // Los mapas de fuente del navegador no se publican (C23: Sentry sin subir sourcemaps).
  productionBrowserSourceMaps: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [{ source: '/(.*)', headers: staticSecurityHeaders({ hsts: IS_HTTPS_PRODUCTION }) }];
  },
};

export default withBundleAnalyzer(nextConfig);
