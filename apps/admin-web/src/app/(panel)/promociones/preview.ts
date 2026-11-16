import type { AdminPromotion } from '@capsur/api-contracts';
import type { PreviewPromotion } from '@/components/PromotionCardPreview';

/** Otras promociones activas (en orden) para acompañar la vista previa. */
export function otherActivePromotions(items: AdminPromotion[], excludeId: string | null): PreviewPromotion[] {
  return items
    .filter((p) => p.active && p.id !== excludeId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({ id: p.id, name: p.name, headline: p.headline, bundleLabel: p.bundle.label, icon: p.icon }));
}
