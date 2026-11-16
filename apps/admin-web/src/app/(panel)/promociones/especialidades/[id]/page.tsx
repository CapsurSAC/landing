import { SlugSchema } from '@capsur/api-contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { PageHeader } from '@/components/ui';
import { specialtyToFormValues } from '@/lib/catalog-forms';
import { listSpecialties } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';
import { SpecialtyForm } from '../SpecialtyForm';

export const metadata: Metadata = { title: 'Editar especialidad' };

export default async function EditSpecialtyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('promotions:manage');
  const { id } = await params;
  if (!SlugSchema.safeParse(id).success) notFound();
  const list = await listSpecialties(user.email);
  if (!list.ok) {
    return (
      <>
        <PageHeader title="Editar especialidad" backHref="/promociones/especialidades" backLabel="Especialidades" />
        <ServiceErrorNotice error={list.error} />
      </>
    );
  }
  const specialty = list.data.items.find((s) => s.id === id);
  if (!specialty) notFound();
  return (
    <>
      <PageHeader title={`Editar «${specialty.name}»`} backHref="/promociones/especialidades" backLabel="Especialidades" />
      <SpecialtyForm initial={specialtyToFormValues(specialty)} />
    </>
  );
}
