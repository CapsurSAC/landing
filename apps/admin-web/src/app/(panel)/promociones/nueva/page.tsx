import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { EMPTY_PROMOTION_VALUES } from '@/lib/catalog-forms';
import { isoToLimaLocal } from '@/lib/dates';
import { listPromotions } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';
import { PromotionForm } from '../PromotionForm';
import { otherActivePromotions } from '../preview';

export const metadata: Metadata = { title: 'Nueva promoción' };

export default async function NewPromotionPage() {
  const user = await requirePermission('promotions:manage');
  const list = await listPromotions(user.email);
  const others = list.ok ? otherActivePromotions(list.data.items, null) : [];
  // Por defecto, vigente desde ahora (hora de Lima, sin segundos).
  const initial = { ...EMPTY_PROMOTION_VALUES, validFrom: isoToLimaLocal(new Date().toISOString()) };
  return (
    <>
      <PageHeader title="Nueva promoción" backHref="/promociones" backLabel="Promociones" />
      <PromotionForm mode="create" initial={initial} others={others} />
    </>
  );
}
