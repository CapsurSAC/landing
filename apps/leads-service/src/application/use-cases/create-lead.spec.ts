import { CreateLeadRequestSchema, EventNames, LeadCreatedPayloadSchema, type CreateLeadInput } from '@capsur/api-contracts';
import {
  ACTIVE_PROMOTION,
  FakeCaptchaVerifier,
  FakeHasher,
  FakeIdempotencyCache,
  FakeOutboxSignal,
  FakePromotionCatalog,
  FakeRateLimiter,
  FixedClock,
  INACTIVE_PROMOTION,
  InMemoryLeadRepository,
  InMemoryStore,
  InMemorySubmissionRepository,
  LEGACY_PROMOTION,
  SilentLogger,
} from '../../../test/support/fakes';
import {
  CaptchaInvalidError,
  CaptchaUnavailableError,
  CatalogUnavailableError,
  IdempotencyKeyReusedError,
  InvalidPhoneNumberError,
  InvalidSpecialtiesError,
  PromotionNotAvailableError,
  TooManyRequestsError,
} from '../../domain/errors';
import { LeadTokenSigner } from '../support/lead-token';
import { scopeIdempotencyKey } from '../support/request-fingerprint';
import { CONFIRMATION_EMAIL_TEMPLATE, CreateLead, type CreateLeadCommand, resolveSpecialties } from './create-lead';

const NOW = new Date('2026-11-13T15:00:00.000Z');
const KEY = '0c9a1c52-4b1e-4f52-9d0e-2b7f1a6c3d40';
const IP_HASH = 'a'.repeat(64);

const BASE_INPUT: CreateLeadInput = {
  brand: 'sis',
  promotionId: 'con-ia',
  campus: 'arequipa',
  specialtyIds: ['desarrollo-software-ia'],
  fullName: 'Ana María Quispe',
  phone: '987 654 321',
  email: 'Ana@Example.com',
  consent: { contactAccepted: true, marketingAccepted: true, privacyVersion: '2026-11' },
  attribution: { utmSource: 'meta', utmCampaign: 'lanzamiento' },
  experiment: { id: 'hero-copy', variant: 'b' },
};

const CLIENT = {
  ipAddress: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  fbc: 'fb.1.1700000000.abc',
  fbp: 'fb.1.1700000000.123',
  eventSourceUrl: 'https://sis.edu.pe/?utm_source=meta',
};

function command(overrides: Partial<CreateLeadInput> = {}, extra: Partial<CreateLeadCommand> = {}): CreateLeadCommand {
  return {
    idempotencyKey: KEY,
    request: CreateLeadRequestSchema.parse({ ...BASE_INPUT, ...overrides }),
    ipHash: IP_HASH,
    userAgent: 'Mozilla/5.0',
    client: CLIENT,
    ...extra,
  };
}

function setup(options: { confirmationEmailEnabled?: boolean } = {}) {
  const store = new InMemoryStore();
  const catalog = new FakePromotionCatalog([ACTIVE_PROMOTION, INACTIVE_PROMOTION, LEGACY_PROMOTION]);
  const cache = new FakeIdempotencyCache();
  const captcha = new FakeCaptchaVerifier();
  const rateLimiter = new FakeRateLimiter();
  const outboxSignal = new FakeOutboxSignal();
  const logger = new SilentLogger();
  const tokens = new LeadTokenSigner('test-only-lead-token-secret-0123');
  let sequence = 0;
  const useCase = new CreateLead({
    leads: new InMemoryLeadRepository(store),
    submissions: new InMemorySubmissionRepository(store),
    catalog,
    cache,
    captcha,
    rateLimiter,
    hasher: new FakeHasher(),
    tokens,
    outboxSignal,
    clock: new FixedClock(NOW),
    logger,
    settings: {
      whatsappNumber: '51987654321',
      brandDisplayName: 'Sistemas del Sur',
      referencePrefix: 'SIS',
      phoneRateLimitPerHour: 5,
      confirmationEmailEnabled: options.confirmationEmailEnabled ?? false,
    },
    idFactory: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  });
  return { store, catalog, cache, captcha, rateLimiter, outboxSignal, logger, tokens, useCase };
}

describe('CreateLead', () => {
  it('crea el lead con sede, especialidades, experimento, hashes, outbox y statusToken firmado', async () => {
    const { store, useCase, tokens, outboxSignal } = setup();

    const result = await useCase.execute(command());

    expect(result.outcome).toBe('created');
    expect(result.response).toMatchObject({
      reference: expect.stringMatching(/^SIS-[A-Z0-9]{5}$/),
      status: 'registered',
      phone: '+51987654321',
      campus: 'arequipa',
      specialties: [{ id: 'desarrollo-software-ia', name: 'Desarrollo de Software con IA' }],
      replayed: false,
    });
    expect(tokens.verify(result.response.leadId, result.response.statusToken)).toBe(true);

    const lead = store.leads.get(result.response.leadId);
    expect(lead).toMatchObject({
      campus: 'arequipa',
      email: 'ana@example.com',
      priceAmount: 24900,
      experiment: { id: 'hero-copy', variant: 'b' },
    });
    expect(lead?.phoneHash).toHaveLength(64);
    expect(lead?.emailHash).toHaveLength(64);

    // El snapshot guardado nunca lleva el statusToken.
    expect(store.submissions[0]?.responseSnapshot).not.toHaveProperty('statusToken');
    expect(store.submissions[0]?.idempotencyKey).toBe(scopeIdempotencyKey(KEY, IP_HASH));
    expect(outboxSignal.notifications).toBe(1);
  });

  it('el evento lead.created.v1 lleva campus, especialidades, headline, precio y client (con marketing)', async () => {
    const { store, useCase } = setup();

    await useCase.execute(command());

    const [event] = store.outboxByName(EventNames.LeadCreated);
    const payload = LeadCreatedPayloadSchema.parse(event?.payload);
    expect(payload).toMatchObject({
      campus: 'arequipa',
      specialties: [{ id: 'desarrollo-software-ia', name: 'Desarrollo de Software con IA' }],
      promotion: { id: 'con-ia', headline: 'S/249', priceAmount: 24900, campaignId: 'lanzamiento-2026' },
      client: {
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
        fbc: 'fb.1.1700000000.abc',
        fbp: 'fb.1.1700000000.123',
        eventSourceUrl: 'https://sis.edu.pe/?utm_source=meta',
      },
    });
  });

  it('sin consentimiento de publicidad el evento no lleva client (A17)', async () => {
    const { store, useCase } = setup();

    await useCase.execute(command({ consent: { contactAccepted: true, marketingAccepted: false, privacyVersion: '2026-11' } }));

    const [event] = store.outboxByName(EventNames.LeadCreated);
    expect(LeadCreatedPayloadSchema.parse(event?.payload).client).toBeUndefined();
  });

  it('encola el correo de confirmación solo si hay SMTP (A7)', async () => {
    const withMail = setup({ confirmationEmailEnabled: true });
    await withMail.useCase.execute(command());
    expect([...withMail.store.notifications.values()]).toEqual([
      expect.objectContaining({ channel: 'email', template: CONFIRMATION_EMAIL_TEMPLATE, status: 'PENDING' }),
    ]);

    const withoutMail = setup();
    await withoutMail.useCase.execute(command());
    expect(withoutMail.store.notifications.size).toBe(0);
  });

  it('replay: misma clave e IP devuelve la respuesta previa con un token válido', async () => {
    const { useCase, tokens, captcha } = setup();

    const first = await useCase.execute(command());
    const second = await useCase.execute(command());

    expect(second.outcome).toBe('replayed');
    expect(second.response).toEqual({ ...first.response, replayed: true });
    expect(tokens.verify(second.response.leadId, second.response.statusToken)).toBe(true);
    // El replay no vuelve a verificar el captcha (el token de Turnstile es de un solo uso).
    expect(captcha.calls).toHaveLength(1);
  });

  it('replay desde la BD cuando la caché está vacía o caída', async () => {
    const { useCase, cache } = setup();
    const first = await useCase.execute(command());
    cache.entries.clear();
    cache.failing = true;

    const second = await useCase.execute(command());

    expect(second.outcome).toBe('replayed');
    expect(second.response.leadId).toBe(first.response.leadId);
  });

  it('la misma clave desde otra IP no reproduce la respuesta (C19)', async () => {
    const { useCase, store } = setup();
    await useCase.execute(command());

    const fromOtherIp = await useCase.execute(command({}, { ipHash: 'b'.repeat(64) }));

    // No es un replay: se trata como envío nuevo (aquí, duplicado del mismo teléfono).
    expect(fromOtherIp.outcome).toBe('duplicate');
    expect(store.submissions.map((s) => s.idempotencyKey)).toEqual([
      scopeIdempotencyKey(KEY, IP_HASH),
      scopeIdempotencyKey(KEY, 'b'.repeat(64)),
    ]);
  });

  it('misma clave con otro cuerpo → IdempotencyKeyReusedError', async () => {
    const { useCase } = setup();
    await useCase.execute(command());

    await expect(useCase.execute(command({ fullName: 'Otra Persona' }))).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
  });

  it('el token de captcha no forma parte de la huella', async () => {
    const { useCase } = setup();
    await useCase.execute(command({ captchaToken: 'token-1' }));

    const replay = await useCase.execute(command({ captchaToken: 'token-2' }));
    expect(replay.outcome).toBe('replayed');
  });

  it('duplicado (mismo teléfono y promoción en 24 h) devuelve el lead existente', async () => {
    const { useCase, store } = setup();
    const first = await useCase.execute(command());

    const duplicate = await useCase.execute(command({}, { idempotencyKey: '1c9a1c52-4b1e-4f52-9d0e-2b7f1a6c3d41' }));

    expect(duplicate.outcome).toBe('duplicate');
    expect(duplicate.response.leadId).toBe(first.response.leadId);
    expect(store.leads.size).toBe(1);
    expect(store.submissions.map((s) => s.outcome)).toEqual(['CREATED', 'DUPLICATE']);
  });

  it('captcha inválido → 400 y caído → 503 (C3)', async () => {
    const { useCase, captcha } = setup();
    captcha.status = 'invalid';
    await expect(useCase.execute(command())).rejects.toBeInstanceOf(CaptchaInvalidError);
    captcha.status = 'unavailable';
    await expect(useCase.execute(command())).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('límite de 5 por teléfono y hora (C2)', async () => {
    const { useCase } = setup();
    for (let i = 0; i < 5; i += 1) {
      await useCase.execute(command({}, { idempotencyKey: `2c9a1c52-4b1e-4f52-9d0e-2b7f1a6c3d4${i}` }));
    }

    const blocked = useCase.execute(command({}, { idempotencyKey: '3c9a1c52-4b1e-4f52-9d0e-2b7f1a6c3d49' }));
    await expect(blocked).rejects.toBeInstanceOf(TooManyRequestsError);
    await expect(blocked).rejects.toMatchObject({ retryAfterSeconds: 1800 });
  });

  it('teléfono inválido', async () => {
    const { useCase } = setup();
    await expect(useCase.execute(command({ phone: '123' }))).rejects.toBeInstanceOf(InvalidPhoneNumberError);
  });

  it('promoción inactiva o inexistente → PromotionNotAvailableError', async () => {
    const { useCase } = setup();
    await expect(useCase.execute(command({ promotionId: 'inactiva', specialtyIds: [] }))).rejects.toBeInstanceOf(
      PromotionNotAvailableError,
    );
    await expect(useCase.execute(command({ promotionId: 'no-existe' }))).rejects.toBeInstanceOf(PromotionNotAvailableError);
  });

  it('catálogo caído → CatalogUnavailableError', async () => {
    const { useCase, catalog } = setup();
    catalog.unavailable = true;
    await expect(useCase.execute(command())).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});

describe('resolveSpecialties (A3)', () => {
  it('acepta la lista vacía siempre, incluso sin datos de especialidades', () => {
    expect(resolveSpecialties(LEGACY_PROMOTION, [])).toEqual([]);
  });

  it('sin specialtiesIncluded/allowedSpecialties no acepta especialidades', () => {
    expect(() => resolveSpecialties(LEGACY_PROMOTION, ['desarrollo-software-ia'])).toThrow(InvalidSpecialtiesError);
  });

  it('rechaza ids no permitidos, repetidos o por encima del máximo', () => {
    expect(() => resolveSpecialties(ACTIVE_PROMOTION, ['contabilidad'])).toThrow(InvalidSpecialtiesError);
    expect(() => resolveSpecialties(ACTIVE_PROMOTION, ['ciencia-datos-ia', 'ciencia-datos-ia'])).toThrow(
      InvalidSpecialtiesError,
    );
    expect(() =>
      resolveSpecialties(ACTIVE_PROMOTION, ['desarrollo-software-ia', 'marketing-digital-ia', 'ciencia-datos-ia']),
    ).toThrow('hasta 2 especialidades');
  });

  it('devuelve id y nombre desde el catálogo', () => {
    expect(resolveSpecialties(ACTIVE_PROMOTION, ['marketing-digital-ia', 'ciencia-datos-ia'])).toEqual([
      { id: 'marketing-digital-ia', name: 'Marketing Digital con IA' },
      { id: 'ciencia-datos-ia', name: 'Ciencia de Datos con IA' },
    ]);
  });
});
