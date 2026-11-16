import { ComplaintStatusSchema } from '@capsur/api-contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DueChip } from '@/components/DueChip';
import { Pagination } from '@/components/Pagination';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, Chip, EmptyState, PageHeader } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/dates';
import { first, type SearchParams } from '@/lib/lead-filters';
import { COMPLAINT_KIND, COMPLAINT_STATUS } from '@/lib/labels';
import { listComplaints } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'Libro de reclamaciones' };

const PAGE_SIZE = 25;

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('complaints:manage');
  const sp = await searchParams;
  const status = ComplaintStatusSchema.safeParse(first(sp.status));
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const result = await listComplaints({ status: status.success ? status.data : undefined, page, pageSize: PAGE_SIZE }, user.email);
  const now = new Date();
  const qs = (p: number, s?: string) => {
    const params = new URLSearchParams();
    if (s) params.set('status', s);
    if (p > 1) params.set('page', String(p));
    const str = params.toString();
    return `/reclamaciones${str ? `?${str}` : ''}`;
  };

  return (
    <>
      <PageHeader
        title="Libro de reclamaciones"
        description="Reclamos y quejas (Ley 29571). Plazo legal de respuesta: 15 días hábiles desde la recepción."
        actions={
          <nav aria-label="Filtrar por estado" className="segmented">
            <Link href={qs(1)} aria-current={!status.success ? 'page' : undefined}>
              Todos
            </Link>
            {ComplaintStatusSchema.options.map((s) => (
              <Link key={s} href={qs(1, s)} aria-current={status.success && status.data === s ? 'page' : undefined}>
                {COMPLAINT_STATUS[s].label}
              </Link>
            ))}
          </nav>
        }
      />
      {!result.ok ? (
        <ServiceErrorNotice error={result.error} />
      ) : (
        <Card bodyClassName="p-0">
          {result.data.items.length === 0 ? (
            <EmptyState>No hay registros{status.success ? ' con ese estado' : ''}.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table" data-testid="complaints-table">
                <caption className="visually-hidden">Reclamos y quejas</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Consumidor</th>
                    <th scope="col">Recibido</th>
                    <th scope="col">Vence</th>
                    <th scope="col">Plazo</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((c) => (
                    <tr key={c.complaintId}>
                      <td className="font-mono text-xs whitespace-nowrap">
                        <Link className="link" href={`/reclamaciones/${c.complaintId}`}>
                          {c.code}
                        </Link>
                      </td>
                      <td>{COMPLAINT_KIND[c.kind]}</td>
                      <td>{c.consumer.fullName}</td>
                      <td className="whitespace-nowrap">{formatDateTime(c.receivedAt)}</td>
                      <td className="whitespace-nowrap">{formatDate(c.responseDueBy)}</td>
                      <td>
                        <DueChip dueBy={c.responseDueBy} closed={c.status === 'answered'} now={now} />
                      </td>
                      <td>
                        <Chip tone={COMPLAINT_STATUS[c.status].tone}>{COMPLAINT_STATUS[c.status].label}</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={result.data.page ?? page}
            pageSize={result.data.pageSize ?? PAGE_SIZE}
            total={result.data.total}
            hrefFor={(p) => qs(p, status.success ? status.data : undefined)}
          />
        </Card>
      )}
    </>
  );
}
