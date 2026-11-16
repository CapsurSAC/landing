import { Inject, Injectable, Logger } from '@nestjs/common';
import { EXCHANGE_EVENTS, type EventEnvelope } from '@capsur/api-contracts';
import type { ConfirmChannel, Options } from 'amqplib';
import type { EventPublisher } from './envelope';
import { BrokerUnavailableError, RabbitMqConnection } from './rabbitmq-connection';

/** El broker rechazó (nack) o no confirmó a tiempo una publicación. */
export class PublishFailedError extends Error {
  readonly code = 'BROKER_NACK';
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PublishFailedError';
  }
}

const CONFIRM_TIMEOUT_MS = 10_000;

/**
 * Publicador con `ConfirmChannel` (B5): mensajes persistentes y promesas que
 * solo resuelven cuando el broker confirma. Tras una reconexión abre un canal
 * nuevo. Sin conexión lanza {@link BrokerUnavailableError} (reintentable).
 */
@Injectable()
export class RabbitMqPublisher implements EventPublisher {
  private readonly logger = new Logger('RabbitMqPublisher');
  private channel: ConfirmChannel | null = null;
  private opening: Promise<ConfirmChannel> | null = null;

  constructor(@Inject(RabbitMqConnection) private readonly connection: RabbitMqConnection) {
    this.connection.onConnected(() => {
      // El canal anterior pertenecía a la conexión perdida.
      this.channel = null;
      this.opening = null;
    });
  }

  /** Publica un sobre en `capsur.events` con routing key = `envelope.name`. */
  async publish(envelope: EventEnvelope): Promise<void> {
    await this.publishRaw(EXCHANGE_EVENTS, envelope.name, Buffer.from(JSON.stringify(envelope), 'utf8'), {
      persistent: true,
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      messageId: envelope.id,
      correlationId: envelope.correlationId,
      type: envelope.name,
      appId: envelope.producer,
      timestamp: Math.floor(Date.parse(envelope.occurredAt) / 1000),
      headers: { 'x-event-version': envelope.version },
    });
    this.logger.debug({ event: envelope.name, eventId: envelope.id }, 'Evento publicado');
  }

  /** Publica contenido arbitrario (p. ej. reenviar el original a la DLX) esperando confirmación. */
  async publishRaw(exchange: string, routingKey: string, content: Buffer, options: Options.Publish = {}): Promise<void> {
    const channel = await this.getChannel();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new PublishFailedError(`El broker no confirmó la publicación en ${CONFIRM_TIMEOUT_MS} ms`));
      }, CONFIRM_TIMEOUT_MS);
      timer.unref();
      try {
        channel.publish(exchange, routingKey, content, options, (error: unknown) => {
          clearTimeout(timer);
          if (error) {
            reject(new PublishFailedError('El broker rechazó la publicación', { cause: error }));
          } else {
            resolve();
          }
        });
      } catch (error) {
        clearTimeout(timer);
        this.channel = null;
        reject(new PublishFailedError('No se pudo publicar: canal cerrado', { cause: error }));
      }
    });
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }
    if (!this.connection.isConnected()) {
      throw new BrokerUnavailableError('RabbitMQ no está disponible para publicar');
    }
    if (!this.opening) {
      const opening = this.connection.createConfirmChannel().then((channel) => {
        channel.on('close', () => {
          if (this.channel === channel) {
            this.channel = null;
          }
        });
        channel.on('error', (error: Error) => {
          this.logger.warn({ err: { type: error.name, message: error.message } }, 'Error en el canal de publicación');
        });
        this.channel = channel;
        return channel;
      });
      this.opening = opening;
      opening
        .finally(() => {
          if (this.opening === opening) {
            this.opening = null;
          }
        })
        .catch(() => undefined);
    }
    return this.opening;
  }
}
