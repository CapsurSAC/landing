import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ProcessWhatsappFollowups } from '../../application/use-cases/process-whatsapp-followups';
import { APP_CONFIG, type Env, isFollowupEnabled } from '../../config/env';
import { errorMessage } from '../consumers/message';

/** Periodicidad de la tarea de seguimientos (A6). */
export const FOLLOWUP_INTERVAL_MS = 15 * 60 * 1000;
/** Primera ejecución tras el arranque (deja que conecten base y broker). */
const FIRST_RUN_DELAY_MS = 30 * 1000;

/**
 * Tarea periódica de seguimientos con plantilla (cada 15 min). Solo se programa si
 * `WHATSAPP_FOLLOWUP_ENABLED=true` y hay `WHATSAPP_FOLLOWUP_TEMPLATE_NAME`. Varias réplicas
 * pueden ejecutarla a la vez: el reparto lo resuelve `FOR UPDATE SKIP LOCKED`.
 */
@Injectable()
export class WhatsappFollowupJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    @Inject(ProcessWhatsappFollowups) private readonly useCase: ProcessWhatsappFollowups,
    @InjectPinoLogger(WhatsappFollowupJob.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (!isFollowupEnabled(this.env)) {
      if (this.env.WHATSAPP_FOLLOWUP_ENABLED) {
        this.logger.warn('WHATSAPP_FOLLOWUP_ENABLED=true sin WHATSAPP_FOLLOWUP_TEMPLATE_NAME: el seguimiento queda desactivado');
      }
      return;
    }
    this.firstRun = setTimeout(() => void this.runOnce(), FIRST_RUN_DELAY_MS);
    this.firstRun.unref();
    this.timer = setInterval(() => void this.runOnce(), FOLLOWUP_INTERVAL_MS);
    this.timer.unref();
    this.logger.info({ intervalMs: FOLLOWUP_INTERVAL_MS, template: this.env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME }, 'Seguimiento con plantilla activado');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.firstRun) clearTimeout(this.firstRun);
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  /** Ejecuta una pasada (sin solaparse con la anterior). */
  runOnce(): Promise<void> {
    if (!this.running) {
      this.running = this.useCase
        .execute()
        .then(() => undefined)
        .catch((error: unknown) => {
          this.logger.error({ error: errorMessage(error) }, 'Error en la tarea de seguimientos con plantilla');
        })
        .finally(() => {
          this.running = null;
        });
    }
    return this.running;
  }
}
