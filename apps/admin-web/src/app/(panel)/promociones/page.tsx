import type { AdminPromotion } from '@capsur/api-contracts';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, Chip, EmptyState, Notice, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/dates';
import { first, type SearchParams } from '@/lib/lead-filters';
import { TRACK, type Tone } from '@/lib/labels';
import { formatSoles } from '@/lib/money';
import { listPromotions } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';
import { deactivatePromotionAction } from './actions';

export const metadata: Metadata = { title: 'Promociones' };

function validity(p: AdminPromotion, now: Date): { label: string; tone: Tone } {
  if (!p.active) return { label: 'Inactiva', tone: 'neutral' };
  if (new Date(p.validFrom) > now) return { label: 'Programada', tone: 'info' };
  if (p.validUntil && new Date(p.validUntil) < now) return { label: 'Vencida', tone: 'warning' };
  return { label: 'Vigente', tone: 'success' };
}

const OK_MESSAGES: Record<string, string> = {
  creada: 'Promoción creada.',
  actualizada: 'Cambios guardados.',
};

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('promotions:manage');
  const sp = await searchParams;
  const ok = OK_MESSAGES[first(sp.ok) ?? ''];
  const result = await listPromotions(user.email);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Promociones"
        description="Catálogo de la landing, incluidas las inactivas. Los cambios se publican al instante (revalidación del catálogo)."
        actions={
          <>
            <Link href="/promociones/especialidades" className="btn btn-secondary">
              Especialidades
            </Link>
            <Link href="/promociones/nueva" className="btn btn-primary">
              <Plus className="size-4" aria-hidden="true" />
              Nueva promoción
            </Link>
          </>
        }
      />
      {ok && (
        <Notice tone="success" className="mb-4">
          {ok} <span className="font-mono text-xs">{first(sp.id)}</span>
        </Notice>
      )}
      {!result.ok ? (
        <ServiceErrorNotice error={result.error} />
      ) : (
        <Card bodyClassName="p-0">
          {result.data.items.length === 0 ? (
            <EmptyState>No hay promociones. Crea la primera.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table" data-testid="promotions-table">
                <caption className="visually-hidden">Promociones</caption>
                <thead>
                  <tr>
                    <th scope="col">Promoción</th>
                    <th scope="col" className="num">Precio</th>
                    <th scope="col">Incluye</th>
                    <th scope="col">Vigencia</th>
                    <th scope="col">Campaña</th>
                    <th scope="col" className="num">Orden</th>
                    <th scope="col">Estado</th>
                    <th scope="col">
                      <span className="visually-hidden">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.data.items]
                    .sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
                    .map((p) => {
                      const v = validity(p, now);
                      return (
                        <tr key={p.id}>
                          <th scope="row">
                            <span className="block font-semibold">
                              {p.name} <span className="font-normal text-ink-500">· {p.headline}</span>
                            </span>
                            <span className="font-mono text-xs text-ink-500">{p.id}</span>
                            {p.featured && (
                              <span className="ml-2">
                                <Chip tone="info">Destacada</Chip>
                              </span>
                            )}
                          </th>
                          <td className="num whitespace-nowrap">
                            {formatSoles(p.price.amount)}
                            {p.listPrice && <span className="block text-xs text-ink-400 line-through">{formatSoles(p.listPrice.amount)}</span>}
                          </td>
                          <td>
                            {p.bundle.label}
                            <span className="block text-xs text-ink-500">{p.bundle.allowedTracks.map((t) => TRACK[t]).join(' · ')}</span>
                          </td>
                          <td className="text-xs whitespace-nowrap">
                            {formatDateTime(p.validFrom)}
                            <span className="block text-ink-500">{p.validUntil ? `hasta ${formatDateTime(p.validUntil)}` : 'sin fecha de fin'}</span>
                          </td>
                          <td className="font-mono text-xs">{p.campaignId ?? '—'}</td>
                          <td className="num">{p.sortOrder}</td>
                          <td>
                            <Chip tone={v.tone}>{v.label}</Chip>
                          </td>
                          <td>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Link href={`/promociones/${p.id}`} className="btn btn-secondary">
                                Editar
                              </Link>
                              {p.active && (
                                <ConfirmDialog
                                  triggerLabel="Desactivar"
                                  title={`¿Desactivar «${p.name}»?`}
                                  description="Dejará de mostrarse en la landing. Los leads ya registrados no cambian. Puedes reactivarla editándola."
                                  confirmLabel="Desactivar"
                                  action={deactivatePromotionAction}
                                  hidden={{ id: p.id }}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
