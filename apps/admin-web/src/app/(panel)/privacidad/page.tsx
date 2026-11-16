import { PrivacyRequestStatusSchema } from '@capsur/api-contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DueChip } from '@/components/DueChip';
import { Pagination } from '@/components/Pagination';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, Chip, EmptyState, PageHeader } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/dates';
import { first, type SearchParams } from '@/lib/lead-filters';
import { PRIVACY_STATUS, PRIVACY_TYPE } from '@/lib/labels';
import { listPrivacyRequests } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'Solicitudes ARCO' };

const PAGE_SIZE = 25;

export default async function PrivacyRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('privacy:manage');
  const sp = await searchParams;
  const status = PrivacyRequestStatusSchema.safeParse(first(sp.status));
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const result = await listPrivacyRequests({ status: status.success ? status.data : undefined, page, pageSize: PAGE_SIZE }, user.email);
  const now = new Date();
  const qs = (p: number, s?: string) => {
    const params = new URLSearchParams();
    if (s) params.set('status', s);
    if (p > 1) params.set('page', String(p));
    const str = params.toString();
    return `/privacidad${str ? `?${str}` : ''}`;
  };

  return (
    <>
      <PageHeader
        title="Solicitudes ARCO"
        description="Derechos de acceso, rectificación, cancelación y oposición (Ley 29733). Plazo: 20 días hábiles."
        actions={
          <nav aria-label="Filtrar por estado" className="segmented">
            <Link href={qs(1)} aria-current={!status.success ? 'page' : undefined}>
              Todas
            </Link>
            {PrivacyRequestStatusSchema.options.map((s) => (
              <Link key={s} href={qs(1, s)} aria-current={status.success && status.data === s ? 'page' : undefined}>
                {PRIVACY_STATUS[s].label}
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
            <EmptyState>No hay solicitudes{status.success ? ' con ese estado' : ''}.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">Solicitudes ARCO</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Derecho</th>
                    <th scope="col">Titular</th>
                    <th scope="col">Referencia</th>
                    <th scope="col">Recibida</th>
                    <th scope="col">Vence</th>
                    <th scope="col">Plazo</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((r) => (
                    <tr key={r.requestId}>
                      <td className="font-mono text-xs whitespace-nowrap">
                        <Link className="link" href={`/privacidad/${r.requestId}`}>
                          {r.code}
                        </Link>
                      </td>
                      <td>{PRIVACY_TYPE[r.type]}</td>
                      <td>{r.fullName}</td>
                      <td className="font-mono text-xs">{r.reference ?? '—'}</td>
                      <td className="whitespace-nowrap">{formatDateTime(r.receivedAt)}</td>
                      <td className="whitespace-nowrap">{formatDate(r.responseDueBy)}</td>
                      <td>
                        <DueChip dueBy={r.responseDueBy} closed={r.status === 'resolved' || r.status === 'rejected'} now={now} />
                      </td>
                      <td>
                        <Chip tone={PRIVACY_STATUS[r.status].tone}>{PRIVACY_STATUS[r.status].label}</Chip>
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
