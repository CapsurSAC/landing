import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { connect, type Channel, type ChannelModel, type ConfirmChannel, type RecoveringChannelModel } from 'amqplib';
import { RabbitMqConsumer, type ConsumerOptions } from './rabbitmq-consumer';

/** Token de las opciones de RabbitMQ. */
export const RABBITMQ_OPTIONS = Symbol('RABBITMQ_OPTIONS');

/** Opciones de la conexión AMQP. */
export interface RabbitMqConnectionOptions {
  /** URL AMQP del usuario del servicio (p. ej. `amqp://leads_svc:…@localhost:5672`). */
  url: string;
  /** Nombre visible en el panel de RabbitMQ (normalmente el del servicio). */
  connectionName: string;
  /** Espera inicial de reconexión. Por defecto 1000 ms. */
  initialDelayMs?: number;
  /** Espera máxima de reconexión. Por defecto 30000 ms. */
  maxDelayMs?: number;
  /** Tiempo máximo esperando mensajes en vuelo al apagar. Por defecto 10000 ms. */
  shutdownTimeoutMs?: number;
}

/** Profundidad y consumidores de una cola (vía `checkQueue`, sin permisos de gestión). */
export interface QueueStats {
  queue: string;
  messageCount: number;
  consumerCount: number;
}

/** Callback invocado en cada (re)conexión. */
export type ConnectionListener = (model: ChannelModel) => void;

/** Se lanza al usar el broker sin conexión activa. */
export class BrokerUnavailableError extends Error {
  readonly code = 'BROKER_UNAVAILABLE';
  constructor(message = 'RabbitMQ no está disponible') {
    super(message);
    this.name = 'BrokerUnavailableError';
  }
}

function describe(error: unknown): { type: string; message: string } | undefined {
  return error instanceof Error ? { type: error.name, message: error.message } : undefined;
}

/**
 * Conexión AMQP compartida (B5) con reconexión exponencial de amqplib
 * (1 s → 30 s). No bloquea el arranque: si el broker no está, el HTTP sigue
 * funcionando, `isConnected()` es `false` y los consumidores se suscriben al
 * conectar.
 *
 * Apagado (B20): en `beforeApplicationShutdown` cancela los consumidores y
 * espera sus mensajes en vuelo (máx. 10 s); en `onApplicationShutdown`
 * cierra los canales y la conexión.
 */
@Injectable()
export class RabbitMqConnection implements OnModuleInit, BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly logger = new Logger('RabbitMqConnection');
  private model: RecoveringChannelModel | null = null;
  private current: ChannelModel | null = null;
  private starting: Promise<void> | null = null;
  private closed = false;
  private consumersStopped = false;
  private readonly listeners = new Set<ConnectionListener>();
  private readonly consumers = new Set<RabbitMqConsumer>();
  private readonly channels = new Set<Channel>();

  constructor(@Inject(RABBITMQ_OPTIONS) private readonly options: RabbitMqConnectionOptions) {}

  onModuleInit(): void {
    this.start();
  }

  /** Inicia la conexión en segundo plano (idempotente). */
  start(): void {
    if (this.starting || this.closed) {
      return;
    }
    this.starting = this.open();
  }

  /** `true` si hay conexión activa con el broker. */
  isConnected(): boolean {
    return this.current !== null;
  }

  /**
   * Registra un callback por cada (re)conexión; si ya hay conexión se invoca
   * de inmediato. Devuelve la función para desuscribirse.
   */
  onConnected(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    if (this.current) {
      this.notify(listener, this.current);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Canal normal sobre la conexión actual (se cierra al apagar). Falla si no hay conexión. */
  async createChannel(): Promise<Channel> {
    return this.track(await this.requireModel().createChannel());
  }

  /** Canal con confirmaciones de publicación. Falla si no hay conexión. */
  async createConfirmChannel(): Promise<ConfirmChannel> {
    return this.track(await this.requireModel().createConfirmChannel());
  }

  /**
   * Crea un consumidor de `queue` (solo `checkQueue`) que se suscribe al
   * conectar y en cada reconexión, y se detiene ordenadamente al apagar.
   *
   * @example
   * connection.createConsumer({ queue: Queues.CrmBridgeLeadFeedback, prefetch: 5, handler: (msg) => this.process(msg) });
   */
  createConsumer(options: ConsumerOptions): RabbitMqConsumer {
    const consumer = new RabbitMqConsumer(options);
    this.consumers.add(consumer);
    if (this.current && !this.consumersStopped) {
      void consumer.attach(this.current);
    }
    return consumer;
  }

  /** Mensajes y consumidores de una cola usando `checkQueue` en un canal temporal. */
  async queueStats(queue: string): Promise<QueueStats> {
    const channel = await this.requireModel().createChannel();
    channel.on('error', () => {
      // Un 404 cierra el canal con error; lo propaga checkQueue.
    });
    try {
      const reply = await channel.checkQueue(queue);
      return { queue: reply.queue, messageCount: reply.messageCount, consumerCount: reply.consumerCount };
    } finally {
      await channel.close().catch(() => undefined);
    }
  }

  /** Detiene los consumidores esperando sus mensajes en vuelo. */
  async stopConsumers(timeoutMs = this.options.shutdownTimeoutMs ?? 10_000): Promise<void> {
    if (this.consumersStopped) {
      return;
    }
    this.consumersStopped = true;
    await Promise.all([...this.consumers].map((consumer) => consumer.stop(timeoutMs)));
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.stopConsumers();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  /** Cierre completo: consumidores, canales y conexión. Idempotente. */
  async close(): Promise<void> {
    await this.stopConsumers();
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.starting?.catch(() => undefined);
    for (const channel of [...this.channels]) {
      await channel.close().catch(() => undefined);
    }
    this.channels.clear();
    const model = this.model;
    this.model = null;
    this.current = null;
    if (model) {
      try {
        await model.close();
      } catch (error) {
        this.logger.warn({ err: describe(error) }, 'Error al cerrar la conexión AMQP');
      }
    }
  }

  private async open(): Promise<void> {
    try {
      const model = await connect(this.options.url, {
        clientProperties: { connection_name: this.options.connectionName },
        recovery: {
          waitForConnect: false,
          initialDelay: this.options.initialDelayMs ?? 1000,
          maxDelay: this.options.maxDelayMs ?? 30_000,
          factor: 2,
          jitter: 0.2,
        },
      });
      if (this.closed) {
        await model.close().catch(() => undefined);
        return;
      }
      this.model = model;
      model.on('connect', (connected: ChannelModel) => this.handleConnect(connected));
      model.on('disconnect', (error: Error) => {
        this.current = null;
        this.channels.clear();
        for (const consumer of this.consumers) {
          consumer.detach();
        }
        if (!this.closed) {
          this.logger.warn({ err: describe(error) }, 'Conexión con RabbitMQ perdida; se reintentará');
        }
      });
      model.on('connect-failed', (error: Error) => {
        this.logger.warn({ err: describe(error) }, 'No se pudo conectar a RabbitMQ; se reintentará con backoff');
      });
      model.on('reconnect-scheduled', (info: { attempt: number; delay: number }) => {
        this.logger.debug({ attempt: info.attempt, delayMs: info.delay }, 'Reintento de conexión AMQP programado');
      });
      model.on('reconnect-failed', (error: Error) => {
        this.logger.error({ err: describe(error) }, 'Se agotaron los reintentos de conexión AMQP');
      });
      model.on('blocked', (reason: string) => {
        this.logger.warn({ reason }, 'RabbitMQ bloqueó la conexión (recursos del broker)');
      });
      model.on('error', (error: Error) => {
        this.logger.error({ err: describe(error) }, 'Error en la conexión AMQP');
      });
    } catch (error) {
      // Solo ocurre con una URL inválida: la recuperación cubre los fallos de red.
      this.logger.error({ err: describe(error) }, 'No se pudo iniciar la conexión AMQP (¿URL inválida?)');
    }
  }

  private handleConnect(connected: ChannelModel): void {
    if (this.closed) {
      return;
    }
    this.current = connected;
    this.logger.log({ connectionName: this.options.connectionName }, 'Conectado a RabbitMQ');
    for (const listener of this.listeners) {
      this.notify(listener, connected);
    }
    if (!this.consumersStopped) {
      for (const consumer of this.consumers) {
        void consumer.attach(connected);
      }
    }
  }

  private notify(listener: ConnectionListener, model: ChannelModel): void {
    try {
      listener(model);
    } catch (error) {
      this.logger.error({ err: describe(error) }, 'Error en un listener de conexión AMQP');
    }
  }

  private requireModel(): ChannelModel {
    if (!this.current) {
      throw new BrokerUnavailableError();
    }
    return this.current;
  }

  private track<T extends Channel>(channel: T): T {
    this.channels.add(channel);
    channel.once('close', () => {
      this.channels.delete(channel);
    });
    return channel;
  }
}
