import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './src/lib/security-headers';

const PROMOTIONS_SERVICE_URL = process.env.PROMOTIONS_SERVICE_URL ?? 'http://localhost:3001';
const LEADS_SERVICE_URL = process.env.LEADS_SERVICE_URL ?? 'http://localhost:3002';
const IS_HTTPS_PRODUCTION = process.env.NODE_ENV === 'production' && (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://');

/** B24: `pnpm --filter @capsur/web-sis analyze` genera los informes en .next/analyze (build con webpack). */
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true', openAnalyzer: false });

/**
 * En producción el gateway (Traefik) enruta /api/v1/* a los servicios antes de
 * llegar a esta app. En desarrollo local, estas reescrituras hacen lo mismo
 * para que el navegador hable siempre con el mismo origen (sin CORS).
 *
 * La CSP con nonce la fija src/proxy.ts por petición; aquí van las cabeceras
 * estáticas para todas las rutas (incluidos estáticos y API).
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
  async rewrites() {
    return [
      { source: '/api/v1/promotions', destination: `${PROMOTIONS_SERVICE_URL}/api/v1/promotions` },
      { source: '/api/v1/specialties', destination: `${PROMOTIONS_SERVICE_URL}/api/v1/specialties` },
      { source: '/api/v1/leads/:path*', destination: `${LEADS_SERVICE_URL}/api/v1/leads/:path*` },
      { source: '/api/v1/leads', destination: `${LEADS_SERVICE_URL}/api/v1/leads` },
      { source: '/api/v1/tracking/:path*', destination: `${LEADS_SERVICE_URL}/api/v1/tracking/:path*` },
      { source: '/api/v1/complaints', destination: `${LEADS_SERVICE_URL}/api/v1/complaints` },
      { source: '/api/v1/privacy/:path*', destination: `${LEADS_SERVICE_URL}/api/v1/privacy/:path*` },
    ];
  },
  async headers() {
    return [{ source: '/(.*)', headers: staticSecurityHeaders({ hsts: IS_HTTPS_PRODUCTION }) }];
  },
};

export default withBundleAnalyzer(nextConfig);
