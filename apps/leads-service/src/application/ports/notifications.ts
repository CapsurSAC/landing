/** Notificación pendiente de envío (correo de confirmación, A7). */
export interface NotificationRecord {
  id: string;
  leadId: string;
  channel: string;
  template: string;
  attempts: number;
}

export interface NotificationRepository {
  /** Reclama pendientes vencidas con `FOR UPDATE SKIP LOCKED` y las reserva `leaseMs`. */
  claimPending(limit: number, now: Date, leaseMs: number): Promise<NotificationRecord[]>;
  markSent(id: string, sentAt: Date): Promise<void>;
  scheduleRetry(id: string, attempts: number, nextAttemptAt: Date, lastError: string): Promise<void>;
  markFailed(id: string, attempts: number, lastError: string): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Envío de correo (nodemailer). Lanza si el servidor SMTP rechaza o no responde. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/** Publica un texto en el canal del equipo (webhook compatible con Slack, A20). */
export interface TeamNotifier {
  postText(text: string): Promise<void>;
}

export const TEAM_NOTIFIER = Symbol('TEAM_NOTIFIER');

/**
 * Candado distribuido (Redis `SET NX PX`) para que una tarea programada se
 * ejecute en una sola réplica. Sin Redis, siempre concede (una instancia).
 */
export interface DistributedLock {
  acquire(key: string, ttlMs: number): Promise<boolean>;
  /** Libera el candado (p. ej. si la tarea falló y otra réplica puede reintentarla). */
  release(key: string): Promise<void>;
}

export const DISTRIBUTED_LOCK = Symbol('DISTRIBUTED_LOCK');

/** Aviso en proceso de que hay eventos nuevos en el outbox (acelera el relay adaptativo). */
export interface OutboxSignal {
  notify(): void;
}

export const OUTBOX_SIGNAL = Symbol('OUTBOX_SIGNAL');
