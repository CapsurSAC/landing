import type { LeadProps } from '../../domain/lead';
import type { Clock } from '../ports/clock';
import type { LeadRepository } from '../ports/lead-repository';
import type { AppLogger } from '../ports/logger';
import type { MailMessage, Mailer, NotificationRepository } from '../ports/notifications';
import { firstNameOf, whatsAppLinkFor, type WhatsAppSettings } from '../support/lead-response-builder';
import { CONFIRMATION_EMAIL_TEMPLATE } from './create-lead';

export interface DispatchSummary {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Correo de confirmación (A7): asunto «Tu solicitud SIS-XXXXX», código,
 * promoción y enlace de WhatsApp, en texto y HTML sencillo.
 */
export function buildConfirmationEmail(
  lead: Pick<LeadProps, 'reference' | 'fullName' | 'email' | 'promotionName' | 'promotionHeadline' | 'specialties'>,
  settings: WhatsAppSettings,
): MailMessage {
  const whatsapp = whatsAppLinkFor(lead, settings);
  const firstName = firstNameOf(lead.fullName);
  const greeting = firstName ? `Hola, ${firstName}:` : 'Hola:';
  const specialties = lead.specialties.map((specialty) => specialty.name).join(', ');
  const promotion = `${lead.promotionName} (${lead.promotionHeadline})`;

  const text = [
    greeting,
    '',
    `Recibimos tu solicitud de información en ${settings.brandDisplayName}.`,
    '',
    `Código de solicitud: ${lead.reference}`,
    `Promoción: ${promotion}`,
    ...(specialties ? [`Especialidades: ${specialties}`] : []),
    '',
    'Para recibir el catálogo y hablar con un asesor, escríbenos por WhatsApp con tu código:',
    whatsapp.url,
    '',
    'Si no hiciste esta solicitud, ignora este correo.',
    '',
    settings.brandDisplayName,
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5">',
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>Recibimos tu solicitud de información en <strong>${escapeHtml(settings.brandDisplayName)}</strong>.</p>`,
    '<table role="presentation" style="border-collapse:collapse">',
    `<tr><td style="padding:4px 12px 4px 0">Código de solicitud</td><td><strong>${escapeHtml(lead.reference)}</strong></td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0">Promoción</td><td>${escapeHtml(promotion)}</td></tr>`,
    ...(specialties
      ? [`<tr><td style="padding:4px 12px 4px 0">Especialidades</td><td>${escapeHtml(specialties)}</td></tr>`]
      : []),
    '</table>',
    '<p>Para recibir el catálogo y hablar con un asesor, escríbenos por WhatsApp con tu código:</p>',
    `<p><a href="${escapeHtml(whatsapp.url)}" style="background:#16a34a;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir WhatsApp</a></p>`,
    '<p style="font-size:12px;color:#6b7280">Si no hiciste esta solicitud, ignora este correo.</p>',
    '</body></html>',
  ].join('');

  return { to: lead.email, subject: `Tu solicitud ${lead.reference}`, text, html };
}

/**
 * Relay de notificaciones (A7): envía los correos pendientes fuera de la
 * petición HTTP, con reintentos y backoff exponencial (1 min → 1 h, 8 intentos).
 */
export class DispatchNotifications {
  private readonly maxAttempts: number;
  private readonly batchSize: number;
  private readonly leaseMs: number;

  constructor(
    private readonly deps: {
      notifications: NotificationRepository;
      leads: LeadRepository;
      mailer: Mailer;
      clock: Clock;
      logger: AppLogger;
      settings: WhatsAppSettings;
      maxAttempts?: number;
      batchSize?: number;
      leaseMs?: number;
    },
  ) {
    this.maxAttempts = deps.maxAttempts ?? 8;
    this.batchSize = deps.batchSize ?? 20;
    this.leaseMs = deps.leaseMs ?? 120_000;
  }

  async execute(): Promise<DispatchSummary> {
    const summary: DispatchSummary = { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };
    const pending = await this.deps.notifications.claimPending(this.batchSize, this.deps.clock.now(), this.leaseMs);
    summary.claimed = pending.length;

    for (const notification of pending) {
      if (notification.channel !== 'email' || notification.template !== CONFIRMATION_EMAIL_TEMPLATE) {
        await this.deps.notifications.markSkipped(notification.id, 'Plantilla no soportada');
        summary.skipped += 1;
        continue;
      }
      const lead = await this.deps.leads.findById(notification.leadId);
      const props = lead?.toProps();
      if (!props || props.anonymizedAt !== null || props.email === '') {
        await this.deps.notifications.markSkipped(notification.id, 'Lead inexistente o anonimizado');
        summary.skipped += 1;
        continue;
      }

      try {
        await this.deps.mailer.send(buildConfirmationEmail(props, this.deps.settings));
        await this.deps.notifications.markSent(notification.id, this.deps.clock.now());
        summary.sent += 1;
        this.deps.logger.info({ notificationId: notification.id, leadId: props.id }, 'Correo de confirmación enviado');
      } catch (error) {
        const attempts = notification.attempts + 1;
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
        if (attempts >= this.maxAttempts) {
          await this.deps.notifications.markFailed(notification.id, attempts, message);
          summary.failed += 1;
          this.deps.logger.error({ notificationId: notification.id, attempts, err: error }, 'Correo de confirmación descartado');
          continue;
        }
        const delayMs = Math.min(60_000 * 2 ** (attempts - 1), 60 * 60 * 1000);
        await this.deps.notifications.scheduleRetry(
          notification.id,
          attempts,
          new Date(this.deps.clock.now().getTime() + delayMs),
          message,
        );
        summary.retried += 1;
        this.deps.logger.warn({ notificationId: notification.id, attempts, err: error }, 'Fallo al enviar el correo; se reintentará');
      }
    }
    return summary;
  }
}
