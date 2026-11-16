import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const PACKAGE_ROOT = resolve(__dirname, '..', '..');

/**
 * Ejecuta `script` en un proceso Node aparte y devuelve `true` si termina con
 * código 0. Es síncrono para poder decidir `describe` / `describe.skip` al
 * recolectar las pruebas (Jest no admite omitir de forma asíncrona).
 */
function probe(script: string, timeoutMs = 20_000): boolean {
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: PACKAGE_ROOT,
    timeout: timeoutMs,
    stdio: 'ignore',
  });
  return result.status === 0;
}

/** URL de Redis para pruebas de integración. */
export const REDIS_TEST_URL = process.env.REDIS_TEST_URL ?? 'redis://localhost:6379';
/** Usuario administrador de RabbitMQ (solo para preparar la topología de prueba). */
export const RABBITMQ_ADMIN_TEST_URL = process.env.RABBITMQ_ADMIN_TEST_URL ?? 'amqp://capsur:capsur@localhost:5672';
/** Usuario de servicio sin permiso `configure` (como en producción). */
export const RABBITMQ_SERVICE_TEST_URL =
  process.env.RABBITMQ_SERVICE_TEST_URL ?? 'amqp://leads_svc:leads_svc_local@localhost:5672';

/** `true` si Redis responde a PING. */
export function isRedisAvailable(): boolean {
  return probe(`
    const { Redis } = require('ioredis');
    const r = new Redis(${JSON.stringify(REDIS_TEST_URL)}, { lazyConnect: true, connectTimeout: 5000, maxRetriesPerRequest: 0, retryStrategy: () => null });
    r.on('error', () => {});
    r.connect().then(() => r.ping()).then(() => { r.disconnect(); process.exit(0); }).catch(() => process.exit(1));
  `);
}

/** `true` si ambos usuarios de RabbitMQ pueden conectarse y existe `capsur.events`. */
export function isRabbitMqAvailable(): boolean {
  return probe(`
    const amqp = require('amqplib');
    (async () => {
      for (const url of [${JSON.stringify(RABBITMQ_ADMIN_TEST_URL)}, ${JSON.stringify(RABBITMQ_SERVICE_TEST_URL)}]) {
        const c = await amqp.connect(url, { timeout: 5000 });
        const ch = await c.createChannel();
        await ch.checkExchange('capsur.events');
        await c.close();
      }
    })().then(() => process.exit(0), () => process.exit(1));
  `);
}

/** Espera activa hasta que `condition` sea verdadera o venza el plazo. */
export async function waitFor(condition: () => boolean, timeoutMs = 5000, stepMs = 20): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor: se agotó el tiempo de espera');
    }
    await new Promise((done) => setTimeout(done, stepMs));
  }
}
