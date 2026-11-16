import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OUTBOX_SIGNAL } from '../../application/ports/notifications';
import { nextOutboxDelay, type RelayOutbox, type RelayOutboxSummary } from '../../application/use-cases/relay-outbox';
import { RELAY_OUTBOX } from '../../application/use-cases/tokens';
import { ENV, type Env } from '../../config/env';
import type { InProcessOutboxSignal } from '../../infrastructure/outbox/in-process-outbox-signal';

/**
 * Planificador del Transactional Outbox con intervalo adaptativo (B10):
 * rápido mientras hay trabajo, se espacia hasta `OUTBOX_POLL_INTERVAL_MS × 5`
 * en reposo y se despierta al instante cuando esta réplica encola un evento.
 * Nunca hay dos pasadas solapadas en la misma réplica; entre réplicas lo
 * evita `FOR UPDATE SKIP LOCKED`.
 */
@Injectable()
export class OutboxRelayWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = false;
  private delayMs: number;
  private unsubscribe: (() => void) | null = null;
  private wokenDuringPass = false;

  constructor(
    @Inject(RELAY_OUTBOX) private readonly relay: RelayOutbox,
    @Inject(OUTBOX_SIGNAL) private readonly signal: InProcessOutboxSignal,
    @Inject(ENV) private readonly env: Env,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.delayMs = env.OUTBOX_POLL_INTERVAL_MS;
  }

  onApplicationBootstrap(): void {
    this.unsubscribe = this.signal.subscribe(() => this.wake());
    this.logger.info(
      { context: OutboxRelayWorker.name, baseIntervalMs: this.env.OUTBOX_POLL_INTERVAL_MS },
      'Relay de outbox iniciado (intervalo adaptativo)',
    );
    this.schedule(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await this.inFlight;
    }
  }

  /** Ejecuta una pasada si no hay otra en curso. Expuesto para pruebas y operación. */
  async tick(): Promise<RelayOutboxSummary | null> {
    if (this.inFlight || this.stopped) {
      return null;
    }
    this.wokenDuringPass = false;
    const pass = this.runPass();
    this.inFlight = pass.then(() => undefined);
    const summary = await pass.finally(() => {
      this.inFlight = null;
    });
    this.delayMs = this.wokenDuringPass
      ? 0
      : nextOutboxDelay(this.delayMs, summary, this.env.OUTBOX_POLL_INTERVAL_MS);
    return summary;
  }

  private async runPass(): Promise<RelayOutboxSummary | null> {
    try {
      const summary = await this.relay.execute();
      if (summary.claimed > 0) {
        this.logger.info({ context: OutboxRelayWorker.name, ...summary }, 'Pasada de outbox completada');
      }
      return summary;
    } catch (error) {
      this.logger.warn(
        { context: OutboxRelayWorker.name, err: error },
        'La pasada de outbox falló; se reintentará en el siguiente intervalo',
      );
      return null;
    }
  }

  /** Intervalo que se usará para la próxima pasada (para el health y las pruebas). */
  get currentDelayMs(): number {
    return this.delayMs;
  }

  private wake(): void {
    if (this.stopped) {
      return;
    }
    this.delayMs = this.env.OUTBOX_POLL_INTERVAL_MS;
    if (this.inFlight) {
      // El evento pudo confirmarse después de que la pasada en curso reclamara: otra pasada al terminar.
      this.wokenDuringPass = true;
    } else {
      this.schedule(0);
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick().then(() => this.schedule(this.delayMs));
    }, delayMs);
    this.timer.unref();
  }
}
