import { createHealthIndicator, HealthService, type HealthExtras } from './health.service';

const options = { service: 'test-service', version: '1.2.3' };

describe('HealthService (B19)', () => {
  it('ok cuando todo responde', async () => {
    const health = new HealthService(options);
    health.register(createHealthIndicator('database', true, () => true));
    health.register(createHealthIndicator('rabbitmq', false, () => true));
    const report = await health.report();
    expect(report).toMatchObject({
      status: 'ok',
      service: 'test-service',
      version: '1.2.3',
      checks: { database: 'up', rabbitmq: 'up' },
    });
    expect(typeof report.timestamp).toBe('string');
  });

  it('degraded si cae una dependencia no crítica; down si cae una crítica', async () => {
    const degraded = new HealthService(options, undefined, [
      createHealthIndicator('database', true, () => true),
      createHealthIndicator('redis', false, () => false),
    ]);
    expect((await degraded.report()).status).toBe('degraded');

    const down = new HealthService(options, undefined, [
      createHealthIndicator('database', true, async () => {
        throw new Error('ECONNREFUSED');
      }),
      createHealthIndicator('redis', false, () => true),
    ]);
    const report = await down.report();
    expect(report.status).toBe('down');
    expect(report.checks).toEqual({ database: 'down', redis: 'up' });
  });

  it('aplica timeout por chequeo', async () => {
    const health = new HealthService({ ...options, checkTimeoutMs: 50 }, undefined, [
      { name: 'slow', critical: false, check: () => new Promise<boolean>(() => undefined) },
    ]);
    const started = Date.now();
    const report = await health.report();
    expect(report.checks.slow).toBe('down');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('cachea el resultado y comparte el cálculo entre peticiones concurrentes', async () => {
    let calls = 0;
    const health = new HealthService({ ...options, cacheTtlMs: 200 }, undefined, [
      createHealthIndicator('database', true, async () => {
        calls += 1;
        await new Promise((done) => setTimeout(done, 20));
        return true;
      }),
    ]);
    await Promise.all([health.report(), health.report(), health.report()]);
    await health.report();
    expect(calls).toBe(1);
    await new Promise((done) => setTimeout(done, 250));
    await health.report();
    expect(calls).toBe(2);
  });

  it('añade campos extra y sobrevive a sus fallos', async () => {
    const extras: HealthExtras = {
      collect: async ({ checks }) => (checks.database === 'up' ? { outbox: { pending: 3 } } : { outbox: null }),
    };
    const health = new HealthService(options, extras, [createHealthIndicator('database', true, () => true)]);
    expect(await health.report()).toMatchObject({ status: 'ok', outbox: { pending: 3 } });

    const failing = new HealthService(
      options,
      {
        collect: async () => {
          throw new Error('fallo');
        },
      },
      [],
    );
    expect((await failing.report()).status).toBe('ok');
  });
});
