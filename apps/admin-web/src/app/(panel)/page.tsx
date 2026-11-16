import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DailyColumns, FunnelChart } from '@/components/charts';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, EmptyState, PageHeader, StatCard } from '@/components/ui';
import { formatDateTime, lastDaysRange, limaDay } from '@/lib/dates';
import { first, type SearchParams } from '@/lib/lead-filters';
import { FEEDBACK_SOURCE, NUMBER, percent } from '@/lib/labels';
import { can } from '@/lib/roles';
import { dailyReport, funnelReport, listPromotions } from '@/lib/server/api';
import { requireUser } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'Resumen' };

const RANGES = [7, 30, 90] as const;

export default async function SummaryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  // El asesor no ve reportes: su inicio es la lista de leads.
  if (!can(user.role, 'reports:read')) redirect('/leads');

  const sp = await searchParams;
  const rangeParam = Number(first(sp.range));
  const days = (RANGES as readonly number[]).includes(rangeParam) ? rangeParam : 30;
  const now = new Date();
  const range = lastDaysRange(days, now);
  const today = limaDay(now);

  const [funnel, daily, promotions] = await Promise.all([
    funnelReport(range, user.email),
    dailyReport(today, user.email),
    listPromotions(user.email),
  ]);
  const promoName = new Map(promotions.ok ? promotions.data.items.map((p) => [p.id, p.name]) : []);

  return (
    <>
      <PageHeader
        title="Resumen"
        description={`Embudo y origen de los leads de los últimos ${days} días (hora de Lima). Actualizado: ${formatDateTime(now.toISOString())}.`}
        actions={
          <nav aria-label="Rango de fechas" className="segmented">
            {RANGES.map((r) => (
              <Link key={r} href={r === 30 ? '/' : `/?range=${r}`} aria-current={r === days ? 'page' : undefined}>
                {r} días
              </Link>
            ))}
          </nav>
        }
      />

      <section aria-labelledby="hoy-title" className="mb-6">
        <h2 id="hoy-title" className="mb-2 text-sm font-semibold text-ink-700">
          Hoy, {today}
        </h2>
        {daily.ok ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="daily-cards">
            <StatCard label="Leads de hoy" value={NUMBER.format(daily.data.leads)} tone="info" />
            <StatCard label="Duplicados" value={NUMBER.format(daily.data.duplicates)} />
            <StatCard label="Sincronizados CRM" value={NUMBER.format(daily.data.crmSynced)} tone="success" />
            <StatCard
              label="Fallos CRM"
              value={NUMBER.format(daily.data.crmFailed)}
              tone={daily.data.crmFailed > 0 ? 'danger' : 'neutral'}
            />
            <StatCard label="Conversaciones" value={NUMBER.format(daily.data.conversationsLinked)} hint="vinculadas en Chatwoot" />
            <StatCard
              label="Lo más pedido"
              value={<span className="text-base">{daily.data.topPromotion ? (promoName.get(daily.data.topPromotion) ?? daily.data.topPromotion) : '—'}</span>}
              hint={daily.data.topCampaign ? `Campaña: ${daily.data.topCampaign}` : 'Sin campaña destacada'}
            />
          </div>
        ) : (
          <ServiceErrorNotice error={daily.error} />
        )}
      </section>

      {!funnel.ok ? (
        <ServiceErrorNotice error={funnel.error} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="Embudo de conversión" className="xl:col-span-2" bodyClassName="p-0">
            {funnel.data.steps.length > 0 ? <FunnelChart steps={funnel.data.steps} /> : <EmptyState>Sin eventos en el rango.</EmptyState>}
          </Card>

          <Card title="Leads por día">
            {funnel.data.daily.length > 0 ? <DailyColumns days={funnel.data.daily} /> : <EmptyState>Sin leads en el rango.</EmptyState>}
          </Card>

          <Card title="Por promoción" bodyClassName="p-0">
            {funnel.data.byPromotion.length === 0 ? (
              <EmptyState>Sin datos.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Promoción</th>
                      <th scope="col" className="num">Leads</th>
                      <th scope="col" className="num">En CRM</th>
                      <th scope="col" className="num">Conversación</th>
                      <th scope="col" className="num">% conversación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.data.byPromotion.map((row) => (
                      <tr key={row.promotionId}>
                        <th scope="row">{promoName.get(row.promotionId) ?? row.promotionId}</th>
                        <td className="num">{NUMBER.format(row.leads)}</td>
                        <td className="num">{NUMBER.format(row.synced)}</td>
                        <td className="num">{NUMBER.format(row.linked)}</td>
                        <td className="num">{percent(row.linked, row.leads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Por campaña (UTM)" bodyClassName="p-0">
            {funnel.data.byCampaign.length === 0 ? (
              <EmptyState>Sin leads con campaña.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Campaña</th>
                      <th scope="col">Fuente</th>
                      <th scope="col" className="num">Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.data.byCampaign.map((row) => (
                      <tr key={`${row.utmCampaign}-${row.utmSource ?? ''}`}>
                        <th scope="row">
                          <Link className="link" href={`/leads?utmCampaign=${encodeURIComponent(row.utmCampaign)}`}>
                            {row.utmCampaign}
                          </Link>
                        </th>
                        <td>{row.utmSource ?? '—'}</td>
                        <td className="num">{NUMBER.format(row.leads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="¿Cómo nos conociste?" bodyClassName="p-0">
            {funnel.data.byFeedbackSource.length === 0 ? (
              <EmptyState>Nadie respondió la encuesta en el rango.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Respuesta</th>
                      <th scope="col" className="num">Leads</th>
                      <th scope="col" className="num">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const total = funnel.data.byFeedbackSource.reduce((acc, r) => acc + r.leads, 0);
                      return funnel.data.byFeedbackSource.map((row) => (
                        <tr key={row.source}>
                          <th scope="row">{FEEDBACK_SOURCE[row.source]}</th>
                          <td className="num">{NUMBER.format(row.leads)}</td>
                          <td className="num">{percent(row.leads, total)}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Experimentos A/B" bodyClassName="p-0" className="xl:col-span-2">
            {funnel.data.experiments.length === 0 ? (
              <EmptyState>No hay experimentos activos en el rango.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table" data-testid="experiments">
                  <thead>
                    <tr>
                      <th scope="col">Experimento</th>
                      <th scope="col">Variante</th>
                      <th scope="col" className="num">Exposiciones</th>
                      <th scope="col" className="num">Envíos</th>
                      <th scope="col" className="num">Tasa de envío</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.data.experiments.map((row) => (
                      <tr key={`${row.id}-${row.variant}`}>
                        <th scope="row">{row.id}</th>
                        <td>{row.variant}</td>
                        <td className="num">{NUMBER.format(row.exposures)}</td>
                        <td className="num">{NUMBER.format(row.submissions)}</td>
                        <td className="num font-semibold text-ink-900">{percent(row.submissions, row.exposures)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
