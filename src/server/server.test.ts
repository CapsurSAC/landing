import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const dataDir = mkdtempSync(path.join(tmpdir(), 'landing-sis-test-'));

beforeAll(() => {
  vi.stubEnv('DATA_DIR', dataDir);
  vi.stubEnv('ADMIN_USER', 'admin@sis.test');
  vi.stubEnv('ADMIN_SESSION_SECRET', 'x'.repeat(40));
});
afterAll(() => vi.unstubAllEnvs());

describe('auth', () => {
  test('verifica la contraseña contra el hash y rechaza otra', async () => {
    const { hashPassword, verifyPassword } = await import('./auth');
    const stored = hashPassword('correcta-123', 'sal-fija');
    expect(verifyPassword('correcta-123', stored)).toBe(true);
    expect(verifyPassword('incorrecta', stored)).toBe(false);
    expect(verifyPassword('correcta-123', 'basura')).toBe(false);
  });

  test('la sesión firmada caduca y no acepta firmas alteradas', async () => {
    const { createSessionToken, hashPassword, readSessionToken } = await import('./auth');
    vi.stubEnv('ADMIN_PASSWORD_HASH', hashPassword('correcta-123', 'sal'));
    const now = Date.now();
    const token = createSessionToken('admin@sis.test', now);
    expect(readSessionToken(token, now + 1000)).toBe('admin@sis.test');
    expect(readSessionToken(token, now + 9 * 60 * 60 * 1000)).toBeNull();
    const [payload] = token.split('.');
    expect(readSessionToken(`${payload}.firmafalsa`, now)).toBeNull();
  });

  test('bloquea tras 5 intentos fallidos', async () => {
    const { recordFailedAttempt, tooManyAttempts } = await import('./auth');
    for (let i = 0; i < 5; i += 1) recordFailedAttempt('login:1.2.3.4');
    expect(tooManyAttempts('login:1.2.3.4')).toBe(true);
    expect(tooManyAttempts('login:5.6.7.8')).toBe(false);
  });
});

describe('db', () => {
  const base = {
    phoneCountry: 'PE',
    phone: '987654321',
    email: 'ana@example.com',
    campus: 'tacna',
    promotionId: 'con-ia',
    promotionName: 'CON IA',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    referrer: '',
  };

  const KEY_ANA = '11111111-1111-4111-8111-111111111111';
  const KEY_LUIS = '22222222-2222-4222-8222-222222222222';

  test('guarda, filtra y resume los leads', async () => {
    const { leadStats, listLeads, updateLeadStatus, upsertLead } = await import('./db');
    const now = new Date('2026-11-16T15:00:00.000Z'); // 10:00 en Lima
    upsertLead(KEY_ANA, { ...base, fullName: 'Ana Prueba', specialties: ['Ciberseguridad 4.0'] }, true, now);
    upsertLead(
      KEY_LUIS,
      { ...base, fullName: 'Luis Prueba', specialties: [], promotionId: 'dos-por-uno', promotionName: '2×1' },
      true,
      new Date('2026-11-01T15:00:00.000Z'),
    );
    const a = listLeads({ q: 'ana' })[0]!.id;

    expect(listLeads().map((l) => l.fullName)).toEqual(['Ana Prueba', 'Luis Prueba']);
    expect(listLeads({ q: 'luis' }).map((l) => l.fullName)).toEqual(['Luis Prueba']);
    expect(listLeads({ specialty: 'Ciberseguridad 4.0' })).toHaveLength(1);
    expect(listLeads({ promotionId: 'dos-por-uno' })).toHaveLength(1);
    expect(listLeads({ from: '2026-11-16', to: '2026-11-16' }).map((l) => l.fullName)).toEqual(['Ana Prueba']);

    updateLeadStatus(a, 'contactado');
    expect(listLeads({ status: 'contactado' }).map((l) => l.id)).toEqual([a]);

    const stats = leadStats(now);
    expect(stats).toMatchObject({ total: 2, abandoned: 0, unattended: 1, today: 1, last7Days: 1 });
    expect(stats.topSpecialty).toEqual({ name: 'Ciberseguridad 4.0', count: 1 });
  });

  test('un formulario a medias se actualiza en el mismo lead y conserva el envío y el estado', async () => {
    const { listLeads, updateLeadStatus, upsertLead } = await import('./db');
    const key = '33333333-3333-4333-8333-333333333333';
    const empty = { ...base, phone: '', email: '', promotionId: '', promotionName: '', specialties: [] };
    upsertLead(key, { ...empty, fullName: 'Rosa' }, false);
    upsertLead(key, { ...empty, fullName: 'Rosa Quispe', phone: '912345678' }, false);

    let rosa = listLeads({ q: 'rosa' });
    expect(rosa).toHaveLength(1);
    expect(rosa[0]).toMatchObject({ fullName: 'Rosa Quispe', phone: '912345678', whatsappSentAt: null });
    expect(listLeads({ whatsapp: 'no' }).map((l) => l.fullName)).toEqual(['Rosa Quispe']);

    updateLeadStatus(rosa[0]!.id, 'contactado');
    upsertLead(key, { ...base, fullName: 'Rosa Quispe', phone: '912345678', specialties: [] }, true);
    upsertLead(key, { ...base, fullName: 'Rosa Quispe Mamani', phone: '912345678', specialties: [] }, false);

    rosa = listLeads({ q: 'rosa' });
    expect(rosa).toHaveLength(1);
    expect(rosa[0]!.whatsappSentAt).not.toBeNull();
    expect(rosa[0]).toMatchObject({ fullName: 'Rosa Quispe Mamani', status: 'contactado', promotionName: 'CON IA' });
  });
});
