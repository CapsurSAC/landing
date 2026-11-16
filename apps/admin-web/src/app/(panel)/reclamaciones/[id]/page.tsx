import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { DueChip } from '@/components/DueChip';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, Chip, Notice, PageHeader } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/dates';
import { first, type SearchParams } from '@/lib/lead-filters';
import { COMPLAINT_KIND, COMPLAINT_STATUS } from '@/lib/labels';
import { findComplaint } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';
import { ResponseForm } from '../ResponseForm';

export const metadata: Metadata = { title: 'Reclamación' };

export default async function ComplaintDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('complaints:manage');
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await findComplaint(id, user.email);
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Reclamación" backHref="/reclamaciones" backLabel="Libro de reclamaciones" />
        <ServiceErrorNotice error={result.error} />
      </>
    );
  }
  const c = result.data;
  if (!c) notFound();

  return (
    <>
      <PageHeader
        title={c.code}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {COMPLAINT_KIND[c.kind]} recibido el {formatDateTime(c.receivedAt)}
            <Chip tone={COMPLAINT_STATUS[c.status].tone}>{COMPLAINT_STATUS[c.status].label}</Chip>
            <DueChip dueBy={c.responseDueBy} closed={c.status === 'answered'} />
          </span>
        }
        backHref="/reclamaciones"
        backLabel="Libro de reclamaciones"
      />
      {first(sp.ok) === 'respondida' && (
        <Notice tone="success" className="mb-4">
          Respuesta registrada.
        </Notice>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Consumidor">
          <dl className="dl">
            <dt>Nombre</dt>
            <dd>{c.consumer.fullName}</dd>
            <dt>Documento</dt>
            <dd>
              {c.consumer.documentType} {c.consumer.documentNumber}
            </dd>
            <dt>Correo</dt>
            <dd>
              <a className="link" href={`mailto:${c.consumer.email}`}>
                {c.consumer.email}
              </a>
            </dd>
            <dt>Teléfono</dt>
            <dd>{c.consumer.phone}</dd>
          </dl>
        </Card>
        <Card title="Plazo legal">
          <dl className="dl">
            <dt>Recibido</dt>
            <dd>{formatDateTime(c.receivedAt)}</dd>
            <dt>Responder antes del</dt>
            <dd>{formatDate(c.responseDueBy)}</dd>
            <dt>Respondido</dt>
            <dd>{formatDateTime(c.respondedAt)}</dd>
          </dl>
        </Card>
        <Card title="Detalle" className="lg:col-span-2">
          <dl className="dl">
            <dt>Bien contratado</dt>
            <dd>{c.itemDescription}</dd>
            <dt>Detalle</dt>
            <dd className="whitespace-pre-line">{c.detail}</dd>
            <dt>Pedido del consumidor</dt>
            <dd className="whitespace-pre-line">{c.request}</dd>
          </dl>
        </Card>
        <Card title="Respuesta" className="lg:col-span-2">
          {c.response ? (
            <p className="text-sm whitespace-pre-line text-ink-900">{c.response}</p>
          ) : (
            <ResponseForm complaintId={c.complaintId} />
          )}
        </Card>
      </div>
    </>
  );
}
