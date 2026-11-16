import { Logger } from '@nestjs/common';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';

/** Controles de un mensaje entregado. Cada mensaje se resuelve una sola vez. */
export interface MessageControls {
  /** Canal del consumidor (p. ej. para leer `prefetch`); no lo cierres. */
  readonly channel: Channel;
  /** Confirma el mensaje. */
  ack(): void;
  /**
   * Rechaza el mensaje. Con `requeue: false` (por defecto) va a la DLX de la
   * cola (patrón de reintento con TTL); con `true` vuelve a la cola.
   */
  nack(options?: { requeue?: boolean }): void;
  /** `true` si ya se hizo ack o nack. */
  readonly settled: boolean;
}

/**
 * Procesa un mensaje. Si termina sin hacer ack/nack se hace `ack`
 * automáticamente; si lanza sin haberlo resuelto, `nack(requeue=false)`.
 */
export type MessageHandler = (message: ConsumeMessage, controls: MessageControls) => Promise<void> | void;

/** Opciones de `RabbitMqConnection.createConsumer`. */
export interface ConsumerOptions {
  /** Cola existente (solo se hace `checkQueue`; la topología es de infraestructura). */
  queue: string;
  /** Mensajes sin confirmar simultáneos. Por defecto 10. */
  prefetch?: number;
  handler: MessageHandler;
  /** Espera antes de reintentar la suscripción si falla. Por defecto 5000 ms. */
  resubscribeDelayMs?: number;
}

/**
 * Consumidor de una cola con resuscripción automática tras reconexiones y
 * apagado ordenado (B20): `stop()` cancela la suscripción, espera los
 * mensajes en vuelo (máx. `timeoutMs`) y cierra el canal.
 */
export class RabbitMqConsumer {
  private readonly logger: Logger;
  private readonly prefetch: number;
  private readonly resubscribeDelayMs: number;
  private model: ChannelModel | null = null;
  private channel: Channel | null = null;
  private consumerTag: string | null = null;
  private subscribing: Promise<void> | null = null;
  private resubscribeTimer: NodeJS.Timeout | null = null;
  private inFlight = 0;
  private drainWaiters: Array<() => void> = [];
  private stopped = false;

  constructor(private readonly options: ConsumerOptions) {
    this.prefetch = options.prefetch ?? 10;
    this.resubscribeDelayMs = options.resubscribeDelayMs ?? 5000;
    this.logger = new Logger(`RabbitMqConsumer:${options.queue}`);
  }

  /** Cola consumida. */
  get queue(): string {
    return this.options.queue;
  }

  /** Mensajes recibidos que aún se están procesando. */
  get inFlightCount(): number {
    return this.inFlight;
  }

  /** `true` si hay una suscripción activa. */
  get isSubscribed(): boolean {
    return this.consumerTag !== null;
  }

  /** Se suscribe sobre una conexión (la llama `RabbitMqConnection` en cada reconexión). */
  attach(model: ChannelModel): Promise<void> {
    this.model = model;
    this.channel = null;
    this.consumerTag = null;
    return this.subscribe();
  }

  /** La conexión se perdió: el canal ya no sirve. */
  detach(): void {
    this.model = null;
    this.channel = null;
    this.consumerTag = null;
  }

  /**
   * Cancela la suscripción, espera a que terminen los mensajes en vuelo
   * (como mucho `timeoutMs`) y cierra el canal. Idempotente.
   */
  async stop(timeoutMs = 10_000): Promise<void> {
    this.stopped = true;
    if (this.resubscribeTimer) {
      clearTimeout(this.resubscribeTimer);
      this.resubscribeTimer = null;
    }
    if (this.subscribing) {
      await this.subscribing.catch(() => undefined);
    }
    const channel = this.channel;
    const tag = this.consumerTag;
    this.consumerTag = null;
    if (channel && tag) {
      try {
        await channel.cancel(tag);
      } catch {
        // El canal puede estar cerrado ya; el broker reentregará lo no confirmado.
      }
    }
    const drained = await this.waitForDrain(timeoutMs);
    if (!drained) {
      this.logger.warn(
        { queue: this.queue, inFlight: this.inFlight, timeoutMs },
        'Apagado: quedan mensajes en vuelo; el broker los reentregará',
      );
    }
    this.channel = null;
    if (channel) {
      try {
        await channel.close();
      } catch {
        // Ya cerrado.
      }
    }
  }

  private subscribe(): Promise<void> {
    if (this.stopped || !this.model || this.channel) {
      return Promise.resolve();
    }
    if (!this.subscribing) {
      this.subscribing = this.doSubscribe().finally(() => {
        this.subscribing = null;
      });
    }
    return this.subscribing;
  }

  private async doSubscribe(): Promise<void> {
    const model = this.model;
    if (!model) {
      return;
    }
    let channel: Channel | null = null;
    try {
      channel = await model.createChannel();
      const current = channel;
      current.on('error', (error: Error) => {
        this.logger.warn({ queue: this.queue, err: { type: error.name, message: error.message } }, 'Error en el canal del consumidor');
      });
      current.on('close', () => {
        if (this.channel === current) {
          this.channel = null;
          this.consumerTag = null;
          this.scheduleResubscribe();
        }
      });
      // Solo comprobación: los usuarios de servicio no tienen permiso `configure`.
      await current.checkQueue(this.queue);
      await current.prefetch(this.prefetch);
      this.channel = current;
      const reply = await current.consume(
        this.queue,
        (message) => {
          if (message) {
            void this.handle(current, message);
          } else {
            // El broker canceló el consumidor (cola borrada): se reintentará.
            this.logger.warn({ queue: this.queue }, 'El broker canceló el consumidor');
            this.consumerTag = null;
            void current.close().catch(() => undefined);
          }
        },
        { noAck: false },
      );
      this.consumerTag = reply.consumerTag;
      this.logger.log({ queue: this.queue, prefetch: this.prefetch }, 'Consumidor suscrito');
    } catch (error) {
      this.logger.error(
        { queue: this.queue, err: error instanceof Error ? { type: error.name, message: error.message } : undefined },
        'No se pudo suscribir a la cola (¿existe la topología?); se reintentará',
      );
      this.channel = null;
      this.consumerTag = null;
      if (channel) {
        // checkQueue con 404 ya cierra el canal; close() solo limpia en el resto de casos.
        await channel.close().catch(() => undefined);
      }
      this.scheduleResubscribe();
    }
  }

  private scheduleResubscribe(): void {
    if (this.stopped || this.resubscribeTimer || !this.model) {
      return;
    }
    this.resubscribeTimer = setTimeout(() => {
      this.resubscribeTimer = null;
      void this.subscribe();
    }, this.resubscribeDelayMs);
    this.resubscribeTimer.unref();
  }

  private async handle(channel: Channel, message: ConsumeMessage): Promise<void> {
    this.inFlight += 1;
    let settled = false;
    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        action();
      } catch (error) {
        // Canal cerrado entre la entrega y la confirmación: el broker reentregará.
        this.logger.warn(
          { queue: this.queue, err: error instanceof Error ? { type: error.name, message: error.message } : undefined },
          'No se pudo confirmar el mensaje',
        );
      }
    };
    const controls: MessageControls = {
      channel,
      ack: () => settle(() => channel.ack(message)),
      nack: (options) => settle(() => channel.nack(message, false, options?.requeue ?? false)),
      get settled() {
        return settled;
      },
    };
    try {
      await this.options.handler(message, controls);
      controls.ack();
    } catch (error) {
      // Nunca se loguea el contenido del mensaje: puede llevar datos personales.
      this.logger.error(
        {
          queue: this.queue,
          messageId: typeof message.properties.messageId === 'string' ? message.properties.messageId : undefined,
          err: error instanceof Error ? { type: error.name, message: error.message } : undefined,
        },
        'Error no controlado procesando un mensaje; se rechaza sin reencolar',
      );
      controls.nack({ requeue: false });
    } finally {
      this.inFlight -= 1;
      if (this.inFlight === 0) {
        const waiters = this.drainWaiters;
        this.drainWaiters = [];
        for (const resolve of waiters) {
          resolve();
        }
      }
    }
  }

  private waitForDrain(timeoutMs: number): Promise<boolean> {
    if (this.inFlight === 0) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.drainWaiters = this.drainWaiters.filter((waiter) => waiter !== onDrain);
        resolve(false);
      }, timeoutMs);
      timer.unref();
      const onDrain = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      this.drainWaiters.push(onDrain);
    });
  }
}
