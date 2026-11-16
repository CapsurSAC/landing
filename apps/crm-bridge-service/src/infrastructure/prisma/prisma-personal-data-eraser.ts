import { Inject, Injectable } from '@nestjs/common';
import { type ErasureResult, type ErasureTarget, type PersonalDataEraser } from '../../application/ports/repositories';
import { FollowupStatus, Prisma } from '../../../prisma/generated/client';
import { PrismaService } from './prisma.service';

/** Contenido que sustituye al cuerpo de los webhooks anonimizados. */
const ERASED_WEBHOOK_PAYLOAD: Prisma.InputJsonObject = { anonymized: true };

/**
 * C9: borra en una sola transacción todo dato personal del lead en la base del servicio.
 * - `sync_jobs`: payload cifrado y heredado → NULL, `last_error` → NULL (puede contener la
 *   respuesta de Chatwoot con datos), `anonymized_at`.
 * - `crm_contact_links`: `anonymized_at` (no guarda datos personales; los ids de Chatwoot se
 *   conservan para poder reintentar el borrado remoto).
 * - `webhook_events` del contacto o la conversación: cuerpo sustituido (mensajes y nombres).
 * - `integration_attempts` y `meta_capi_events`: errores → NULL.
 * - `whatsapp_followups` pendientes → SKIPPED.
 */
@Injectable()
export class PrismaPersonalDataEraser implements PersonalDataEraser {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async erase(target: ErasureTarget, at: Date): Promise<ErasureResult> {
    const webhookFilters: Prisma.WebhookEventWhereInput[] = [];
    if (target.crmContactId) {
      webhookFilters.push({ contactId: target.crmContactId });
    }
    if (target.crmConversationId) {
      webhookFilters.push({ conversationId: target.crmConversationId });
    }

    const [syncJobs, contactLinks, webhookEvents, attempts, followups, metaCapiEvents] = await this.prisma.$transaction([
      this.prisma.syncJob.updateMany({
        where: { leadId: target.leadId },
        data: { payload: Prisma.DbNull, payloadEncrypted: null, lastError: null, anonymizedAt: at },
      }),
      this.prisma.crmContactLink.updateMany({ where: { leadId: target.leadId }, data: { anonymizedAt: at } }),
      this.prisma.webhookEvent.updateMany({
        where: webhookFilters.length > 0 ? { OR: webhookFilters } : { id: { in: [] } },
        data: { payload: ERASED_WEBHOOK_PAYLOAD },
      }),
      this.prisma.integrationAttempt.updateMany({ where: { leadId: target.leadId, error: { not: null } }, data: { error: null } }),
      this.prisma.whatsappFollowup.updateMany({
        where: { leadId: target.leadId, status: { in: [FollowupStatus.PENDING, FollowupStatus.PROCESSING] } },
        data: { status: FollowupStatus.SKIPPED, lastError: 'anonymized', lockedUntil: null },
      }),
      this.prisma.metaCapiEvent.updateMany({ where: { leadId: target.leadId, lastError: { not: null } }, data: { lastError: null } }),
    ]);

    return {
      syncJobs: syncJobs.count,
      contactLinks: contactLinks.count,
      webhookEvents: webhookEvents.count,
      attempts: attempts.count,
      followups: followups.count,
      metaCapiEvents: metaCapiEvents.count,
    };
  }
}
