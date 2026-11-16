import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LeadStatusChip, waLink } from '@/components/LeadStatusChip';
import { ServiceErrorNotice } from '@/components/ServiceErrorNotice';
import { Card, Chip, Notice, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/dates';
import { CAMPUS, FEEDBACK_SOURCE, TRACK } from '@/lib/labels';
import { can } from '@/lib/roles';
import { getLead, listSpecialties } from '@/lib/server/api';
import { requirePermission } from '@/lib/server/auth';
import { chatwootLinks } from '@/lib/server/env';
import { anonymizeLeadAction } from '../actions';

export const metadata: Metadata = { title: 'Detalle del lead' };

const ATTRIBUTION_LABELS: [string, string][] = [
  ['utmSource', 'utm_source'],
  ['utmMedium', 'utm_medium'],
  ['utmCampaign', 'utm_campaign'],
  ['utmContent', 'utm_content'],
  ['utmTerm', 'utm_term'],
  ['referrer', 'Referente'],
  ['landingPath', 'Página de entrada'],
  ['fbclid', 'fbclid'],
  ['gclid', 'gclid'],
];

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('leads:read');
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [lead, specialties] = await Promise.all([getLead(id, user.email), listSpecialties(user.email)]);
  if (!lead.ok) {
    if (lead.error.kind === 'http' && lead.error.status === 404) notFound();
    return (
      <>
        <PageHeader title="Detalle del lead" backHref="/leads" backLabel="Leads" />
        <ServiceErrorNotice error={lead.error} />
      </>
    );
  }

  const l = lead.data;
  const specialtyById = new Map(specialties.ok ? specialties.data.items.map((s) => [s.id, s]) : []);
  const wa = waLink(l.phone);
  const links = chatwootLinks(l.crm.contactId, l.crm.conversationId);
  const attribution = ATTRIBUTION_LABELS.map(([key, label]) => [label, l.attribution?.[key as keyof typeof l.attribution]] as const).filter(
    ([, value]) => Boolean(value),
  );

  return (
    <>
      <PageHeader
        title={l.reference}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Registrado el {formatDateTime(l.createdAt)} <LeadStatusChip status={l.status} />
            {l.anonymized && <Chip tone="neutral">Anonimizado</Chip>}
          </span>
        }
        backHref="/leads"
        backLabel="Leads"
        actions={
          can(user.role, 'leads:anonymize') && !l.anonymized ? (
            <ConfirmDialog
              testId="anonymize-open"
              triggerLabel="Anonimizar"
              title={`¿Anonimizar ${l.reference}?`}
              description={
                <>
                  <p>
                    Se borrarán de forma <strong>irreversible</strong> el nombre, el teléfono, el correo y la atribución de este lead. Se
                    conservan la referencia y los datos estadísticos.
                  </p>
                  <p className="mt-2">Úsalo para atender una solicitud de cancelación (ARCO) o por indicación del área legal.</p>
                </>
              }
              confirmLabel="Sí, anonimizar"
              action={anonymizeLeadAction}
              hidden={{ leadId: l.leadId }}
            >
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="deleteCrmContact" className="mt-0.5 size-4 accent-danger-600" />
                <span>
                  Eliminar también el contacto en Chatwoot
                  <span className="block text-xs text-ink-500">Borra el contacto y sus conversaciones del CRM.</span>
                </span>
              </label>
            </ConfirmDialog>
          ) : null
        }
      />

      {l.anonymized && (
        <Notice tone="info" className="mb-4">
          Este lead fue anonimizado: sus datos personales ya no están disponibles.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Contacto">
          <dl className="dl">
            <dt>Nombre</dt>
            <dd>{l.fullName}</dd>
            <dt>WhatsApp</dt>
            <dd>
              {wa && !l.anonymized ? (
                <a className="link" href={wa} target="_blank" rel="noopener noreferrer">
                  {l.phone}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt>Correo</dt>
            <dd>{l.email && !l.anonymized ? <a className="link" href={`mailto:${l.email}`}>{l.email}</a> : '—'}</dd>
            <dt>Sede</dt>
            <dd>{CAMPUS[l.campus]}</dd>
            <dt>Marca</dt>
            <dd className="uppercase">{l.brand}</dd>
            <dt>¿Cómo nos conoció?</dt>
            <dd>{l.feedbackSource ? FEEDBACK_SOURCE[l.feedbackSource] : 'Sin respuesta'}</dd>
          </dl>
        </Card>

        <Card title="Promoción y especialidades">
          <dl className="dl">
            <dt>Promoción</dt>
            <dd>
              {l.promotion.name} <span className="text-ink-500">({l.promotion.headline})</span>
            </dd>
            <dt>Especialidades</dt>
            <dd>
              {l.specialtyIds.length === 0 ? (
                <span className="text-ink-500">Lo decide con un asesor</span>
              ) : (
                <ul className="space-y-1">
                  {l.specialtyIds.map((sid) => {
                    const s = specialtyById.get(sid);
                    return (
                      <li key={sid}>
                        {s ? s.name : sid} {s && <Chip tone={s.track === 'ia' ? 'info' : 'neutral'}>{TRACK[s.track]}</Chip>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </dd>
          </dl>
        </Card>

        <Card title="CRM (Chatwoot)">
          <dl className="dl">
            <dt>Estado</dt>
            <dd>
              <LeadStatusChip status={l.status} />
            </dd>
            <dt>Contacto</dt>
            <dd>
              {l.crm.contactId ? (
                links.contact ? (
                  <a className="link" href={links.contact} target="_blank" rel="noopener noreferrer">
                    #{l.crm.contactId} ↗
                  </a>
                ) : (
                  `#${l.crm.contactId}`
                )
              ) : (
                '—'
              )}
            </dd>
            <dt>Conversación</dt>
            <dd>
              {l.crm.conversationId ? (
                links.conversation ? (
                  <a className="link" href={links.conversation} target="_blank" rel="noopener noreferrer">
                    #{l.crm.conversationId} ↗
                  </a>
                ) : (
                  `#${l.crm.conversationId}`
                )
              ) : (
                'Aún no escribió por WhatsApp'
              )}
            </dd>
            <dt>Sincronizado</dt>
            <dd>{formatDateTime(l.crm.syncedAt)}</dd>
            <dt>Conversación vinculada</dt>
            <dd>{formatDateTime(l.crm.conversationLinkedAt)}</dd>
          </dl>
        </Card>

        <Card title="Consentimiento">
          <dl className="dl">
            <dt>Contacto</dt>
            <dd>
              <Chip tone="success">Aceptado</Chip>
            </dd>
            <dt>Publicidad</dt>
            <dd>{l.consent.marketingAccepted ? <Chip tone="success">Autorizada</Chip> : <Chip>No autorizada</Chip>}</dd>
            <dt>Versión de la política</dt>
            <dd className="font-mono text-xs">{l.consent.privacyVersion}</dd>
          </dl>
        </Card>

        <Card title="Atribución" className="lg:col-span-2">
          {attribution.length === 0 ? (
            <p className="text-sm text-ink-500">Sin datos de atribución (tráfico directo o datos borrados).</p>
          ) : (
            <dl className="dl">
              {attribution.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt>{label}</dt>
                  <dd className="font-mono text-xs">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>
    </>
  );
}
