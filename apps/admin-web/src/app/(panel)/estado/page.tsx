import type { Metadata } from 'next';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, Chip, EmptyState, Notice, PageHeader, StatCard } from '@/components/ui';
import { formatDateTime } from '@/lib/dates';
import { HEALTH_STATUS, NUMBER, SERVICE_LABEL } from '@/lib/labels';
import { can } from '@/lib/roles';
import { integrationSummary, probeHealth, unifiedAudit } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';
import { RetryButton } from './RetryButton';

export const metadata: Metadata = { title: 'Estado de la plataforma' };

function metadataSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '';
  const text = JSON.stringify(metadata);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export default async function StatusPage() {
  const user = await requirePermission('status:read');
  const [probes, summary, audit] = await Promise.all([
    Promise.all((['promotions', 'leads', 'crm'] as const).map((s) => probeHealth(s))),
    integrationSummary(user.email),
    unifiedAudit(user.email, 30),
  ]);
  const checkedAt = new Date().toISOString();

  return (
    <>
      <PageHeader title="Estado de la plataforma" description={`Comprobado el ${formatDateTime(checkedAt)} (hora de Lima). Recarga la página para actualizar.`} />

      <section aria-labelledby="salud-title" className="mb-6">
        <h2 id="salud-title" className="mb-2 text-sm font-semibold text-ink-700">
          Salud de los servicios
        </h2>
        <div className="grid gap-3 md:grid-cols-3" data-testid="health">
          {probes.map((p) => {
            const status = p.health ? HEALTH_STATUS[p.health.status] : HEALTH_STATUS.down;
            return (
              <div key={p.service} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-ink-900">{SERVICE_LABEL[p.service]}</p>
                    <p className="text-xs text-ink-500">
                      {p.health ? `v${p.health.version}` : 'sin respuesta'}
                      {p.latencyMs !== null && ` · ${p.latencyMs} ms`}
                    </p>
                  </div>
                  <Chip tone={status.tone}>{status.label}</Chip>
                </div>
                {p.error && <p className="mt-2 text-xs text-danger-700">{p.error}</p>}
                {p.health && Object.keys(p.health.checks).length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`Dependencias de ${SERVICE_LABEL[p.service]}`}>
                    {Object.entries(p.health.checks).map(([name, value]) => (
                      <li key={name}>
                        <Chip tone={value === 'up' ? 'success' : 'danger'}>
                          {name}: {value === 'up' ? 'ok' : 'caído'}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Integración con Chatwoot (crm-bridge)" className="xl:col-span-2">
          {!summary.ok ? (
            <ServiceErrorNotice error={summary.error} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="jobs">
                <StatCard label="Pendientes" value={NUMBER.format(summary.data.jobs.pending)} tone="info" />
                <StatCard label="Correctos" value={NUMBER.format(summary.data.jobs.succeeded)} tone="success" />
                <StatCard label="Fallidos" value={NUMBER.format(summary.data.jobs.failed)} tone={summary.data.jobs.failed > 0 ? 'warning' : 'neutral'} />
                <StatCard label="Muertos (DEAD)" value={NUMBER.format(summary.data.jobs.dead)} tone={summary.data.jobs.dead > 0 ? 'danger' : 'neutral'} />
              </div>
              <dl className="dl">
                <dt>Última sincronización</dt>
                <dd>{formatDateTime(summary.data.lastSyncAt)}</dd>
                <dt>Chatwoot</dt>
                <dd>
                  {summary.data.chatwootConfigured ? (
                    <Chip tone="success">Configurado</Chip>
                  ) : (
                    <Chip tone="warning">Sin configurar (los leads no llegan al CRM)</Chip>
                  )}
                </dd>
              </dl>
              {can(user.role, 'status:retry') && <RetryButton pendingJobs={summary.data.jobs.failed + summary.data.jobs.dead} />}
            </div>
          )}
        </Card>

        <Card title="Colas de RabbitMQ" bodyClassName="p-0">
          {!summary.ok ? (
            <EmptyState>No disponible.</EmptyState>
          ) : summary.data.queues.length === 0 ? (
            <EmptyState>Sin colas reportadas.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table" data-testid="queues">
                <thead>
                  <tr>
                    <th scope="col">Cola</th>
                    <th scope="col" className="num">Mensajes</th>
                    <th scope="col" className="num">Consumidores</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.queues.map((q) => {
                    const isDlq = q.name.endsWith('.dlq');
                    return (
                      <tr key={q.name}>
                        <th scope="row" className="font-mono text-xs">
                          {q.name}
                        </th>
                        <td className="num">
                          {q.messages > 0 && isDlq ? <Chip tone="danger">{NUMBER.format(q.messages)}</Chip> : NUMBER.format(q.messages)}
                        </td>
                        <td className="num">
                          {q.consumers === 0 && !isDlq && !q.name.endsWith('.retry') ? <Chip tone="warning">0</Chip> : q.consumers}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Auditoría reciente" bodyClassName="p-0">
          {audit.errors.length > 0 && (
            <div className="space-y-2 p-3">
              {audit.errors.map((e) => (
                <Notice key={e.service} tone="warning">
                  {SERVICE_LABEL[e.service]}: {e.message}
                </Notice>
              ))}
            </div>
          )}
          {audit.rows.length === 0 ? (
            <EmptyState>Sin acciones registradas.</EmptyState>
          ) : (
            <div className="table-wrap max-h-[32rem] overflow-y-auto">
              <table className="table" data-testid="audit">
                <thead className="sticky top-0">
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Servicio</th>
                    <th scope="col">Quién</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.rows.map((row) => (
                    <tr key={`${row.source}-${row.id}`}>
                      <td className="text-xs whitespace-nowrap tabular-nums">{formatDateTime(row.at)}</td>
                      <td className="font-mono text-xs">{row.source}</td>
                      <td className="text-xs">
                        {row.actor ?? <span className="text-ink-500">—</span>}
                        <span className="block text-ink-500">vía {row.caller}</span>
                      </td>
                      <td className="text-xs">
                        <span className="font-mono font-semibold text-ink-900">{row.action}</span>
                        {row.target && <span className="block font-mono text-ink-500">{row.target}</span>}
                        {row.metadata && <span className="block break-all text-ink-500">{metadataSummary(row.metadata)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
