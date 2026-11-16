import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice, PageHeader } from '@/components/ui';
import { homeFor } from '@/lib/roles';
import { requireUser } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'Sin permiso' };

export default async function ForbiddenPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Sin permiso" />
      <Notice tone="warning" title="Tu rol no tiene acceso a esta sección.">
        Si lo necesitas, pide a una persona administradora que revise tu rol.{' '}
        <Link className="link" href={homeFor(user.role)}>
          Ir a mi inicio
        </Link>
      </Notice>
    </>
  );
}
