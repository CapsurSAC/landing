import { LeadStatusSchema, CampusSchema } from '@capsur/api-contracts';
import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LeadStatusChip, waLink } from '@/components/LeadStatusChip';
import { Pagination } from '@/components/Pagination';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/dates';
import { hasActiveFilters, PAGE_SIZES, parseLeadFilters, toPanelQuery, type SearchParams } from '@/lib/lead-filters';
import { CAMPUS, LEAD_STATUS } from '@/lib/labels';
import { can } from '@/lib/roles';
import { listLeads, listPromotions } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'Leads' };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('leads:read');
  const filters = parseLeadFilters(await searchParams);
  const [leads, promotions] = await Promise.all([listLeads(filters, user.email), listPromotions(user.email)]);
  const canExport = can(user.role, 'leads:export');
  const exportHref = `/leads/export${toPanelQuery(filters, { page: 1 })}`;

  return (
    <>
      <PageHeader
        title="Leads"
        description="Solicitudes registradas desde la landing. Fechas en hora de Lima."
        actions={
          canExport ? (
            <a href={exportHref} className="btn btn-secondary" download data-testid="export-csv">
              <Download className="size-4" aria-hidden="true" />
              Exportar CSV
            </a>
          ) : null
        }
      />

      <Card className="mb-5" bodyClassName="p-4">
        <form method="get" action="/leads" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" role="search" aria-label="Filtrar leads">
          <div className="sm:col-span-2 xl:col-span-2">
            <label htmlFor="q" className="label">
              Buscar
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder="SIS-XXXXX, correo o teléfono"
              maxLength={160}
              className="input"
              aria-describedby="q-hint"
            />
            <p id="q-hint" className="hint">
              Coincidencia exacta.
            </p>
          </div>
          <div>
            <label htmlFor="status" className="label">
              Estado CRM
            </label>
            <select id="status" name="status" defaultValue={filters.status ?? ''} className="input">
              <option value="">Todos</option>
              {LeadStatusSchema.options.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS[s].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="promotionId" className="label">
              Promoción
            </label>
            {promotions.ok ? (
              <select id="promotionId" name="promotionId" defaultValue={filters.promotionId ?? ''} className="input">
                <option value="">Todas</option>
                {promotions.data.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.active ? '' : ' (inactiva)'}
                  </option>
                ))}
              </select>
            ) : (
              <input id="promotionId" name="promotionId" defaultValue={filters.promotionId} placeholder="id de promoción" className="input" />
            )}
          </div>
          <div>
            <label htmlFor="campus" className="label">
              Sede
            </label>
            <select id="campus" name="campus" defaultValue={filters.campus ?? ''} className="input">
              <option value="">Todas</option>
              {CampusSchema.options.map((c) => (
                <option key={c} value={c}>
                  {CAMPUS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="utmCampaign" className="label">
              Campaña
            </label>
            <input
              id="utmCampaign"
              name="utmCampaign"
              defaultValue={filters.utmCampaign}
              maxLength={150}
              placeholder="utm_campaign"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="from" className="label">
              Desde
            </label>
            <input id="from" name="from" type="date" defaultValue={filters.from} className="input" />
          </div>
          <div>
            <label htmlFor="to" className="label">
              Hasta
            </label>
            <input id="to" name="to" type="date" defaultValue={filters.to} className="input" />
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-8">
            <div>
              <label htmlFor="pageSize" className="label">
                Por página
              </label>
              <select id="pageSize" name="pageSize" defaultValue={String(filters.pageSize)} className="input w-24">
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              Filtrar
            </button>
            {hasActiveFilters(filters) && (
              <Link href="/leads" className="btn btn-secondary">
                Limpiar filtros
              </Link>
            )}
          </div>
        </form>
      </Card>

      {!promotions.ok && <p className="mb-3 text-xs text-ink-500">No se pudo cargar la lista de promociones: {promotions.error.message}</p>}

      {!leads.ok ? (
        <ServiceErrorNotice error={leads.error} />
      ) : (
        <Card bodyClassName="p-0">
          {leads.data.items.length === 0 ? (
            <EmptyState>{hasActiveFilters(filters) ? 'Ningún lead coincide con los filtros.' : 'Todavía no hay leads.'}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table" data-testid="leads-table">
                <caption className="visually-hidden">Lista de leads</caption>
                <thead>
                  <tr>
                    <th scope="col">Referencia</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">WhatsApp</th>
                    <th scope="col">Promoción</th>
                    <th scope="col">Sede</th>
                    <th scope="col">Estado CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.data.items.map((lead) => {
                    const wa = waLink(lead.phone);
                    return (
                      <tr key={lead.leadId}>
                        <td className="font-mono text-xs whitespace-nowrap">
                          <Link className="link" href={`/leads/${lead.leadId}`}>
                            {lead.reference}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap tabular-nums">{formatDateTime(lead.createdAt)}</td>
                        <td className="min-w-40">{lead.anonymized ? <span className="text-ink-400 italic">[anonimizado]</span> : lead.fullName}</td>
                        <td className="whitespace-nowrap">
                          {wa && !lead.anonymized ? (
                            <a className="link" href={wa} target="_blank" rel="noopener noreferrer">
                              {lead.phone}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{lead.promotion.name}</td>
                        <td>{CAMPUS[lead.campus]}</td>
                        <td>
                          <LeadStatusChip status={lead.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={leads.data.page}
            pageSize={leads.data.pageSize}
            total={leads.data.total}
            hrefFor={(page) => `/leads${toPanelQuery(filters, { page })}`}
          />
        </Card>
      )}
    </>
  );
}
