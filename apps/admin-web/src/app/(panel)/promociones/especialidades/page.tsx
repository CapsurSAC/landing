import type { Metadata } from 'next';
import Link from 'next/link';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, Chip, EmptyState, Notice, PageHeader } from '@/components/ui';
import { first, type SearchParams } from '@/lib/lead-filters';
import { TRACK } from '@/lib/labels';
import { listSpecialties } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'Especialidades' };

export default async function SpecialtiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('promotions:manage');
  const sp = await searchParams;
  const result = await listSpecialties(user.email);

  return (
    <>
      <PageHeader
        title="Especialidades"
        description="Especialidades que el visitante puede elegir dentro de cada promoción."
        backHref="/promociones"
        backLabel="Promociones"
      />
      {first(sp.ok) === 'actualizada' && (
        <Notice tone="success" className="mb-4">
          Especialidad guardada. <span className="font-mono text-xs">{first(sp.id)}</span>
        </Notice>
      )}
      {!result.ok ? (
        <ServiceErrorNotice error={result.error} />
      ) : (
        <Card bodyClassName="p-0">
          {result.data.items.length === 0 ? (
            <EmptyState>No hay especialidades.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">Especialidades</caption>
                <thead>
                  <tr>
                    <th scope="col">Especialidad</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Modalidad</th>
                    <th scope="col">Respaldo</th>
                    <th scope="col" className="num">Orden</th>
                    <th scope="col">Estado</th>
                    <th scope="col">
                      <span className="visually-hidden">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.data.items]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((s) => (
                      <tr key={s.id}>
                        <th scope="row">
                          <span className="block font-semibold">{s.name}</span>
                          <span className="font-mono text-xs text-ink-500">{s.id}</span>
                        </th>
                        <td>
                          <Chip tone={s.track === 'ia' ? 'info' : 'neutral'}>{TRACK[s.track]}</Chip>
                        </td>
                        <td>{s.modality}</td>
                        <td>{s.endorsedBy ?? '—'}</td>
                        <td className="num">{s.sortOrder}</td>
                        <td>{s.active ? <Chip tone="success">Activa</Chip> : <Chip>Inactiva</Chip>}</td>
                        <td className="text-right">
                          <Link href={`/promociones/especialidades/${s.id}`} className="btn btn-secondary">
                            Editar
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
