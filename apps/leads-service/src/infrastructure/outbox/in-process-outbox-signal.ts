import type { OutboxSignal } from '../../application/ports/notifications';

/**
 * Aviso en proceso de que hay eventos nuevos en el outbox: el relay
 * adaptativo (B10) se despierta sin esperar a su intervalo, que en reposo
 * puede llegar a `OUTBOX_POLL_INTERVAL_MS × 5`. Otras réplicas siguen
 * enterándose por sondeo.
 */
export class InProcessOutboxSignal implements OutboxSignal {
  private readonly listeners = new Set<() => void>();

  notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
