import { randomUUID } from 'node:crypto';
import { connect, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { EXCHANGE_EVENTS, type EventEnvelope } from '@capsur/api-contracts';
import {
  isRabbitMqAvailable,
  RABBITMQ_ADMIN_TEST_URL,
  RABBITMQ_SERVICE_TEST_URL,
  waitFor,
} from '../testing/probe';
import { buildEnvelope, versionFromEventName } from './envelope';
import { BrokerUnavailableError, RabbitMqConnection } from './rabbitmq-connection';
import { RabbitMqPublisher } from './rabbitmq-publisher';

describe('buildEnvelope', () => {
  it('construye el sobre del contrato con versión deducida del nombre', () => {
    const envelope = buildEnvelope('lead.created.v1', { leadId: 'x' }, { producer: 'leads-service', correlationId: 'x' });
    expect(envelope).toMatchObject({ name: 'lead.created.v1', version: 1, producer: 'leads-service', correlationId: 'x', payload: { leadId: 'x' } });
    expect(envelope.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(envelope.occurredAt).toISOString()).toBe(envelope.occurredAt);
    expect(versionFromEventName('crm.sync.failed.v12')).toBe(12);
    expect(versionFromEventName('sin-version')).toBe(1);
  });

  it('respeta id y fecha (republicación desde outbox)', () => {
    const envelope = buildEnvelope('x.v2', null, { producer: 'p', correlationId: 'c', id: 'id-1', occurredAt: new Date(0) });
    expect(envelope).toMatchObject({ id: 'id-1', version: 2, occurredAt: '1970-01-01T00:00:00.000Z' });
  });
});

describe('RabbitMqPublisher sin broker', () => {
  it('lanza BrokerUnavailableError si no hay conexión (no bloquea)', async () => {
    const connection = new RabbitMqConnection({ url: 'amqp://localhost:1', connectionName: 'test' });
    const publisher = new RabbitMqPublisher(connection);
    await expect(publisher.publish(buildEnvelope('x.v1', {}, { producer: 'p', correlationId: 'c' }))).rejects.toBeInstanceOf(
      BrokerUnavailableError,
    );
    await connection.close();
  });
});

const describeRabbit = isRabbitMqAvailable() ? describe : describe.skip;

describeRabbit('RabbitMQ real con usuario sin permiso configure (leads_svc)', () => {
  const suffix = randomUUID().slice(0, 8);
  const queue = `leads.nest-kit-test-${suffix}`;
  const eventName = `nestkit.test.${suffix}.v1`;
  let admin: ChannelModel;
  let connection: RabbitMqConnection;
  let publisher: RabbitMqPublisher;

  beforeAll(async () => {
    // Topología de prueba creada por el administrador (como haría infraestructura).
    admin = await connect(RABBITMQ_ADMIN_TEST_URL);
    admin.on('error', () => undefined);
    const channel = await admin.createChannel();
    // RabbitMQ 4 no permite colas transitorias no exclusivas: durable y se borra en afterAll.
    await channel.assertQueue(queue, { durable: true, autoDelete: false });
    await channel.bindQueue(queue, EXCHANGE_EVENTS, eventName);
    await channel.close();

    connection = new RabbitMqConnection({ url: RABBITMQ_SERVICE_TEST_URL, connectionName: `nest-kit-test-${suffix}` });
    connection.start();
    await waitFor(() => connection.isConnected(), 10_000);
    publisher = new RabbitMqPublisher(connection);
  }, 20_000);

  afterAll(async () => {
    await connection?.close();
    const channel = await admin.createChannel();
    await channel.deleteQueue(queue);
    await admin.close();
  }, 20_000);

  it('publica con confirmación en capsur.events, consume con checkQueue y expone queueStats', async () => {
    const received: Array<EventEnvelope<{ n: number }>> = [];
    const consumer = connection.createConsumer({
      queue,
      prefetch: 5,
      handler: (message: ConsumeMessage) => {
        received.push(JSON.parse(message.content.toString('utf8')) as EventEnvelope<{ n: number }>);
      },
    });
    await waitFor(() => consumer.isSubscribed, 5000);

    for (let n = 1; n <= 3; n += 1) {
      await publisher.publish(buildEnvelope(eventName, { n }, { producer: 'nest-kit-test', correlationId: `c-${n}` }));
    }
    await waitFor(() => received.length === 3, 5000);
    expect(received.map((envelope) => envelope.payload.n).sort()).toEqual([1, 2, 3]);
    expect(received[0]?.name).toBe(eventName);

    const stats = await connection.queueStats(queue);
    expect(stats).toMatchObject({ queue, messageCount: 0, consumerCount: 1 });

    await consumer.stop();
    expect((await connection.queueStats(queue)).consumerCount).toBe(0);
  });

  it('queueStats rechaza colas inexistentes sin romper la conexión', async () => {
    await expect(connection.queueStats(`leads.no-existe-${suffix}`)).rejects.toThrow();
    expect(connection.isConnected()).toBe(true);
  });

  it('apagado ordenado: cancela, espera los mensajes en vuelo y no pierde mensajes', async () => {
    let started = 0;
    let finished = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const consumer = connection.createConsumer({
      queue,
      prefetch: 2,
      handler: async () => {
        started += 1;
        await gate;
        finished += 1;
      },
    });
    await waitFor(() => consumer.isSubscribed, 5000);
    await publisher.publish(buildEnvelope(eventName, { n: 10 }, { producer: 'nest-kit-test', correlationId: 'slow-1' }));
    await publisher.publish(buildEnvelope(eventName, { n: 11 }, { producer: 'nest-kit-test', correlationId: 'slow-2' }));
    await waitFor(() => started === 2, 5000);

    const stopping = consumer.stop(5000);
    // Mientras se detiene, los mensajes en vuelo siguen pendientes.
    await new Promise((done) => setTimeout(done, 100));
    expect(finished).toBe(0);
    release();
    await stopping;
    expect(finished).toBe(2);
    expect(consumer.inFlightCount).toBe(0);
    expect((await connection.queueStats(queue)).messageCount).toBe(0);
  });

  it('un handler que lanza hace nack sin reencolar (el mensaje sale de la cola)', async () => {
    let attempts = 0;
    const consumer = connection.createConsumer({
      queue,
      handler: () => {
        attempts += 1;
        throw new Error('fallo de prueba');
      },
    });
    await waitFor(() => consumer.isSubscribed, 5000);
    await publisher.publish(buildEnvelope(eventName, { n: 20 }, { producer: 'nest-kit-test', correlationId: 'fail' }));
    await waitFor(() => attempts === 1, 5000);
    await consumer.stop();
    expect((await connection.queueStats(queue)).messageCount).toBe(0);
  });

  it('publishRaw al exchange por defecto falla sin permiso de escritura y no tumba la conexión', async () => {
    await expect(publisher.publishRaw('', queue, Buffer.from('{}'), { persistent: true })).rejects.toThrow();
    await waitFor(() => connection.isConnected(), 5000);
    await expect(
      publisher.publish(buildEnvelope(eventName, { n: 30 }, { producer: 'nest-kit-test', correlationId: 'after' })),
    ).resolves.toBeUndefined();
    // Vacía el mensaje para no dejar restos.
    const consumer = connection.createConsumer({ queue, handler: () => undefined });
    await waitFor(() => consumer.isSubscribed, 5000);
    await waitFor(() => consumer.inFlightCount === 0, 2000);
    await new Promise((done) => setTimeout(done, 100));
    await consumer.stop();
  });
});
