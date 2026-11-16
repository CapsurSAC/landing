import { SlugSchema } from '@capsur/api-contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { PageHeader } from '@/components/ui';
import { promotionToFormValues } from '@/lib/catalog-forms';
import { formatDateTime } from '@/lib/dates';
import { listPromotions } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';
import { PromotionForm } from '../PromotionForm';
import { otherActivePromotions } from '../preview';

export const metadata: Metadata = { title: 'Editar promoción' };

export default async function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('promotions:manage');
  const { id } = await params;
  if (!SlugSchema.safeParse(id).success) notFound();

  // El contrato no define GET por id: se toma de la lista de administración.
  const list = await listPromotions(user.email);
  if (!list.ok) {
    return (
      <>
        <PageHeader title="Editar promoción" backHref="/promociones" backLabel="Promociones" />
        <ServiceErrorNotice error={list.error} />
      </>
    );
  }
  const promotion = list.data.items.find((p) => p.id === id);
  if (!promotion) notFound();

  return (
    <>
      <PageHeader
        title={`Editar «${promotion.name}»`}
        description={`Creada el ${formatDateTime(promotion.createdAt)} · última modificación ${formatDateTime(promotion.updatedAt)}`}
        backHref="/promociones"
        backLabel="Promociones"
      />
      <PromotionForm mode="edit" initial={promotionToFormValues(promotion)} others={otherActivePromotions(list.data.items, promotion.id)} />
    </>
  );
}
