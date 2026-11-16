/**
 * Repositorios Prisma contra PostgreSQL 17 real (Testcontainers): migraciones,
 * consultas con `select` explícito, traducción de errores de la base a
 * errores de dominio y almacén de auditoría.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { CampaignNotFoundError, PromotionAlreadyExistsError, PromotionNotFoundError } from '../../src/domain';
import { PrismaAuditStore } from '../../src/infrastructure/prisma/prisma-audit.store';
import { PrismaPromotionRepository } from '../../src/infrastructure/prisma/prisma-promotion.repository';
import { PrismaSpecialtyRepository } from '../../src/infrastructure/prisma/prisma-specialty.repository';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { makePromotion, makeSpecialty } from '../support/fakes';

const SERVICE_ROOT = path.resolve(__dirname, '../..');
const PRISMA_BIN = path.join(SERVICE_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');

describe('repositorios Prisma (integración)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('promotions')
      .withUsername('promotions')
      .withPassword('promotions')
      .start();
    const url = `${container.getConnectionUri()}?schema=public`;
    execFileSync(PRISMA_BIN, ['migrate', 'deploy'], {
      cwd: SERVICE_ROOT,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.onModuleInit();

    await prisma.brand.create({ data: { id: 'sis', name: 'Sistemas del Sur', displayName: 'IEST Privado Sistemas del Sur' } });
    await prisma.campaign.create({
      data: { id: 'especialidades-ia-2026-11', brandId: 'sis', name: 'Especialidades con IA', startsAt: new Date('2026-11-01') },
    });
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
    await container?.stop();
  });

  it('crea, lista y actualiza promociones con sus marcas de tiempo', async () => {
    const repo = new PrismaPromotionRepository(prisma);
    const created = await repo.create(makePromotion({ id: 'con-ia' }));
    expect(created.promotion.id).toBe('con-ia');
    expect(created.createdAt).toBeInstanceOf(Date);

    const updated = await repo.update(makePromotion({ id: 'con-ia', headline: 'S/229', campaignId: null }));
    expect(updated.promotion.headline).toBe('S/229');
    expect(updated.promotion.campaignId).toBeNull();
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    await repo.update(makePromotion({ id: 'con-ia', active: false }));
    expect(await repo.findActiveByBrand('sis')).toHaveLength(0);
    expect((await repo.listByBrand('sis')).map((r) => r.promotion.active)).toEqual([false]);
  });

  it('traduce los errores de la base a errores de dominio', async () => {
    const repo = new PrismaPromotionRepository(prisma);
    await repo.create(makePromotion({ id: 'duplicada' }));

    await expect(repo.create(makePromotion({ id: 'duplicada' }))).rejects.toBeInstanceOf(PromotionAlreadyExistsError);
    await expect(repo.create(makePromotion({ id: 'sin-campania', campaignId: 'no-existe' }))).rejects.toBeInstanceOf(
      CampaignNotFoundError,
    );
    await expect(repo.update(makePromotion({ id: 'fantasma' }))).rejects.toBeInstanceOf(PromotionNotFoundError);
  });

  it('actualiza especialidades y distingue activas de inactivas', async () => {
    await prisma.specialty.create({
      data: {
        id: 'desarrollo-web-con-ia',
        brandId: 'sis',
        name: 'Desarrollo Web con Inteligencia Artificial',
        track: 'IA',
        summary: 'Plataformas inteligentes.',
      },
    });
    const repo = new PrismaSpecialtyRepository(prisma);
    await repo.update(makeSpecialty({ id: 'desarrollo-web-con-ia', active: false, summary: 'Nuevo resumen' }));
    expect(await repo.findActiveByBrand('sis')).toHaveLength(0);
    const all = await repo.listByBrand('sis');
    expect(all[0]).toMatchObject({ id: 'desarrollo-web-con-ia', active: false, summary: 'Nuevo resumen' });
  });

  it('guarda y lista la auditoría en orden descendente', async () => {
    const store = new PrismaAuditStore(prisma);
    const base = { caller: 'admin-web', actor: 'ana@capsur.pe', target: 'con-ia', metadata: { method: 'PUT' } };
    await store.record({ ...base, id: randomUUID(), at: '2026-11-13T10:00:00.000Z', action: 'promotion.create' });
    await store.record({ ...base, id: randomUUID(), at: '2026-11-13T11:00:00.000Z', action: 'promotion.update' });
    const entries = await store.list(10);
    expect(entries.map((e) => e.action)).toEqual(['promotion.update', 'promotion.create']);
    expect(entries[0]?.metadata).toEqual({ method: 'PUT' });
  });
});
