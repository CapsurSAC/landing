import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DISTRIBUTED_LOCK, type DistributedLock } from '../../application/ports/notifications';
import type { AnonymizeExpiredLeads } from '../../application/use-cases/anonymize-lead';
import type { DispatchNotifications } from '../../application/use-cases/dispatch-notifications';
import type { SendDailyReport } from '../../application/use-cases/reports';
import { ANONYMIZE_EXPIRED_LEADS, DISPATCH_NOTIFICATIONS, SEND_DAILY_REPORT } from '../../application/use-cases/tokens';
import { ENV, type Env } from '../../config/env';
import { limaDateOf, msUntilNextLimaHour } from '../../domain/lima-calendar';
import { backfillPii } from '../../infrastructure/pii/pii-backfill';
import { PII_CODEC, type PiiCodec } from '../../infrastructure/pii/pii-codec';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Intervalo del relay de correos (A7). */
export const NOTIFICATION_POLL_INTERVAL_MS = 10_000;

/**
 * Envía los correos de confirmación pendientes (A7) fuera de la petición HTTP.
 * Solo se activa si `SMTP_URL` está definido.
 */
@Injectable()
export class NotificationWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    @Inject(DISPATCH_NOTIFICATIONS) private readonly dispatch: DispatchNotifications,
    @Inject(ENV) private readonly env: Env,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.SMTP_URL) {
      this.logger.info({ context: NotificationWorker.name }, 'SMTP_URL no definido: correo de confirmación desactivado');
      return;
    }
    this.timer = setInterval(() => void this.tick(), NOTIFICATION_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.inFlight;
  }

  async tick(): Promise<void> {
    if (this.inFlight) {
      return;
    }
    this.inFlight = this.dispatch
      .execute()
      .then((summary) => {
        if (summary.claimed > 0) {
          this.logger.info({ context: NotificationWorker.name, ...summary }, 'Pasada de notificaciones completada');
        }
      })
      .catch((error: unknown) => {
        this.logger.warn({ context: NotificationWorker.name, err: error }, 'La pasada de notificaciones falló');
      })
      .finally(() => {
        this.inFlight = null;
      });
    await this.inFlight;
  }
}

/**
 * Tareas diarias a una hora de Lima, sin dependencias nuevas (`setTimeout`
 * recalculado cada día):
 * - retención de leads (C9) a `RETENTION_HOUR`;
 * - reporte diario al webhook del equipo (A20) a `DAILY_REPORT_HOUR`, si hay URL.
 *
 * Un candado en Redis por tarea y fecha (`SET NX PX`) evita que varias
 * réplicas ejecuten lo mismo.
 */
@Injectable()
export class ScheduledJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly timers = new Set<NodeJS.Timeout>();
  private stopped = false;

  constructor(
    @Inject(ANONYMIZE_EXPIRED_LEADS) private readonly retention: AnonymizeExpiredLeads,
    @Inject(SEND_DAILY_REPORT) private readonly dailyReport: SendDailyReport,
    @Inject(DISTRIBUTED_LOCK) private readonly lock: DistributedLock,
    @Inject(ENV) private readonly env: Env,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.scheduleDaily('retention', this.env.RETENTION_HOUR, () => this.runRetention());
    if (this.env.DAILY_REPORT_WEBHOOK_URL) {
      this.scheduleDaily('daily-report', this.env.DAILY_REPORT_HOUR, async () => {
        await this.dailyReport.execute();
      });
    } else {
      this.logger.info({ context: ScheduledJobs.name }, 'DAILY_REPORT_WEBHOOK_URL no definido: reporte diario desactivado');
    }
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /** Retención con candado por fecha de Lima (una réplica por día). */
  async runRetention(): Promise<void> {
    const key = `leads:lock:retention:${limaDateOf(new Date())}`;
    if (!(await this.lock.acquire(key, 23 * 60 * 60 * 1000))) {
      this.logger.info({ context: ScheduledJobs.name }, 'Retención ya ejecutada por otra réplica');
      return;
    }
    try {
      await this.retention.execute();
    } catch (error) {
      await this.lock.release(key).catch(() => undefined);
      throw error;
    }
  }

  private scheduleDaily(name: string, hour: number, task: () => Promise<void>): void {
    if (this.stopped) {
      return;
    }
    const delayMs = msUntilNextLimaHour(new Date(), hour);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void task()
        .catch((error: unknown) => {
          this.logger.error({ context: ScheduledJobs.name, job: name, err: error }, 'La tarea programada falló');
        })
        .finally(() => this.scheduleDaily(name, hour, task));
    }, delayMs);
    timer.unref();
    this.timers.add(timer);
    this.logger.info(
      { context: ScheduledJobs.name, job: name, nextRunAt: new Date(Date.now() + delayMs).toISOString() },
      'Tarea diaria programada',
    );
  }
}

/**
 * Al arrancar, cifra en segundo plano los datos personales heredados en claro
 * (C8). Idempotente y seguro con varias réplicas; no bloquea el HTTP.
 */
@Injectable()
export class PiiBackfillOnStartup implements OnApplicationBootstrap {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PII_CODEC) private readonly codec: PiiCodec,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    void backfillPii(this.prisma, this.codec, (message, context) =>
      this.logger.info({ context: PiiBackfillOnStartup.name, ...context }, message),
    ).catch((error: unknown) => {
      this.logger.warn({ context: PiiBackfillOnStartup.name, err: error }, 'No se pudo completar el backfill de datos personales');
    });
  }
}
