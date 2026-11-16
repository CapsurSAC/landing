import type { MetadataRoute } from 'next';
import { getPromotions, getSpecialties } from '@/lib/catalog';
import { siteConfig } from '@/lib/config';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [promotions, specialties] = await Promise.all([getPromotions(), getSpecialties()]);
  const url = (path: string) => `${siteConfig.siteUrl}${path}`;
  return [
    { url: url('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...specialties.items.map((s) => ({
      url: url(`/especialidades/${s.id}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...promotions.items.map((p) => ({
      url: url(`/promociones/${p.id}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    { url: url('/libro-de-reclamaciones'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/derechos-arco'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/politica-de-privacidad'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/politica-de-privacidad/versiones'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
