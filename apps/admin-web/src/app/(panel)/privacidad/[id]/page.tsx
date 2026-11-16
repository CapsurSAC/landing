import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { DueChip } from '@/components/DueChip';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, Chip, Notice, PageHeader } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/dates';
import { first, type SearchParams } from '@/lib/lead-filters';
import { PRIVACY_STATUS, PRIVACY_TYPE } from '@/lib/labels';
import { findPrivacyRequest } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';
import { ResolutionForm } from '../ResolutionForm';

export const metadata: Metadata = { title: 'Solicitud ARCO' };

export default async function PrivacyRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('privacy:manage');
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await findPrivacyRequest(id, user.email);
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Solicitud ARCO" backHref="/privacidad" backLabel="Solicitudes ARCO" />
        <ServiceErrorNotice error={result.error} />
      </>
    );
  }
  const r = result.data;
  if (!r) notFound();
  const closed = r.status === 'resolved' || r.status === 'rejected';

  return (
    <>
      <PageHeader
        title={r.code}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {PRIVACY_TYPE[r.type]} · recibida el {formatDateTime(r.receivedAt)}
            <Chip tone={PRIVACY_STATUS[r.status].tone}>{PRIVACY_STATUS[r.status].label}</Chip>
            <DueChip dueBy={r.responseDueBy} closed={closed} />
          </span>
        }
        backHref="/privacidad"
        backLabel="Solicitudes ARCO"
      />
      {first(sp.ok) === 'guardada' && (
        <Notice tone="success" className="mb-4">
          Resolución guardada.
        </Notice>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Titular">
          <dl className="dl">
            <dt>Nombre</dt>
            <dd>{r.fullName}</dd>
            <dt>Correo</dt>
            <dd>
              <a className="link" href={`mailto:${r.email}`}>
                {r.email}
              </a>
            </dd>
            <dt>Teléfono</dt>
            <dd>{r.phone ?? '—'}</dd>
            <dt>Código de solicitud</dt>
            <dd>
              {r.reference ? (
                <Link className="link font-mono text-xs" href={`/leads?q=${encodeURIComponent(r.reference)}`}>
                  {r.reference}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </dl>
        </Card>
        <Card title="Plazo">
          <dl className="dl">
            <dt>Recibida</dt>
            <dd>{formatDateTime(r.receivedAt)}</dd>
            <dt>Responder antes del</dt>
            <dd>{formatDate(r.responseDueBy)}</dd>
            <dt>Resuelta</dt>
            <dd>{formatDateTime(r.resolvedAt)}</dd>
          </dl>
        </Card>
        <Card title="Detalle de la solicitud" className="lg:col-span-2">
          <p className="text-sm whitespace-pre-line text-ink-900">{r.detail ?? 'Sin detalle.'}</p>
        </Card>
        <Card title={closed ? 'Resolución' : 'Resolver'} className="lg:col-span-2">
          {r.resolution && <p className="mb-4 text-sm whitespace-pre-line text-ink-900">{r.resolution}</p>}
          {!closed && (
            <ResolutionForm
              requestId={r.requestId}
              currentStatus={r.status}
              suggestAnonymize={r.type === 'cancellation' || r.type === 'revoke_consent'}
            />
          )}
        </Card>
      </div>
    </>
  );
}
