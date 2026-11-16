import { randomUUID } from 'node:crypto';
import {
  EventNames,
  LeadCreatedPayloadSchema,
  type CreateLeadRequest,
  type CreateLeadResponse,
  type LeadCreatedPayload,
} from '@capsur/api-contracts';
import {
  CaptchaInvalidError,
  CaptchaUnavailableError,
  IdempotencyKeyReusedError,
  InvalidSpecialtiesError,
  PromotionNotAvailableError,
  ReferenceCollisionError,
  TooManyRequestsError,
} from '../../domain/errors';
import type { LeadProps, LeadSpecialty } from '../../domain/lead';
import { LeadReference, type RandomIndex } from '../../domain/lead-reference';
import { PhoneNumber } from '../../domain/phone-number';
import type { Clock } from '../ports/clock';
import type { IdempotencyCache, StoredLeadResponse } from '../ports/idempotency-cache';
import type { CreateLeadAggregate, LeadRepository } from '../ports/lead-repository';
import type { AppLogger } from '../ports/logger';
import type { OutboxSignal } from '../ports/notifications';
import type { CatalogPromotion, PromotionCatalog } from '../ports/promotion-catalog';
import type { CaptchaVerifier, PersonalDataHasher, RateLimiter } from '../ports/security';
import type { SubmissionRepository } from '../ports/submission-repository';
import { buildLeadResponse } from '../support/lead-response-builder';
import type { LeadTokenSigner } from '../support/lead-token';
import { fingerprintRequest, normalizeEmail, scopeIdempotencyKey } from '../support/request-fingerprint';

export const PRODUCER_NAME = 'leads-service';
export const CONFIRMATION_EMAIL_TEMPLATE = 'lead_confirmation';

/** Datos técnicos del navegador para Meta Conversions API (A17); solo viajan con `marketingAccepted`. */
export interface LeadClientContext {
  ipAddress: string | null;
  userAgent: string | null;
  fbc: string | null;
  fbp: string | null;
  eventSourceUrl: string | null;
}

export interface CreateLeadCommand {
  /** `Idempotency-Key` ya validada (UUID). */
  idempotencyKey: string;
  /** Cuerpo ya validado por `CreateLeadRequestSchema`. */
  request: CreateLeadRequest;
  ipHash: string | null;
  userAgent: string | null;
  client: LeadClientContext;
}

export type CreateLeadOutcome = 'created' | 'duplicate' | 'replayed';

export interface CreateLeadResult {
  outcome: CreateLeadOutcome;
  response: CreateLeadResponse;
}

export interface CreateLeadSettings {
  whatsappNumber: string;
  brandDisplayName: string;
  referencePrefix: string;
  /** Registros permitidos por teléfono (hash) y hora (C2). */
  phoneRateLimitPerHour: number;
  /** Encolar el correo de confirmación (A7) si hay SMTP configurado. */
  confirmationEmailEnabled: boolean;
  /** Ventana de duplicados. Por defecto 24 h. */
  duplicateWindowMs?: number;
  /** TTL de la caché de idempotencia. Por defecto 24 h. */
  idempotencyTtlSeconds?: number;
  /** Reintentos ante colisión de referencia. Por defecto 5. */
  maxReferenceAttempts?: number;
}

export interface CreateLeadDependencies {
  leads: LeadRepository;
  submissions: SubmissionRepository;
  catalog: PromotionCatalog;
  cache: IdempotencyCache;
  captcha: CaptchaVerifier;
  rateLimiter: RateLimiter;
  hasher: PersonalDataHasher;
  tokens: LeadTokenSigner;
  outboxSignal: OutboxSignal;
  clock: Clock;
  logger: AppLogger;
  settings: CreateLeadSettings;
  /** Inyectables para pruebas deterministas. */
  randomIndex?: RandomIndex;
  idFactory?: () => string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function clip(value: string | null, max: number): string | undefined {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed.slice(0, max);
}

/**
 * Registra una solicitud de información (§5 de la spec). Orden:
 * replay (clave con alcance de IP) → captcha → teléfono → límite por teléfono
 * → promoción y especialidades → duplicado → creación transaccional con outbox.
 *
 * El replay va antes del captcha: un reintento de red reenvía el mismo token
 * de Turnstile, que es de un solo uso.
 */
export class CreateLead {
  private readonly duplicateWindowMs: number;
  private readonly idempotencyTtlSeconds: number;
  private readonly maxReferenceAttempts: number;
  private readonly idFactory: () => string;

  constructor(private readonly deps: CreateLeadDependencies) {
    this.duplicateWindowMs = deps.settings.duplicateWindowMs ?? DAY_MS;
    this.idempotencyTtlSeconds = deps.settings.idempotencyTtlSeconds ?? DAY_MS / 1000;
    this.maxReferenceAttempts = deps.settings.maxReferenceAttempts ?? 5;
    this.idFactory = deps.idFactory ?? randomUUID;
  }

  async execute(command: CreateLeadCommand): Promise<CreateLeadResult> {
    const { request } = command;
    const scopedKey = scopeIdempotencyKey(command.idempotencyKey, command.ipHash);
    const fingerprint = fingerprintRequest(request);

    const replayed = await this.findReplay(scopedKey, fingerprint);
    if (replayed) {
      return { outcome: 'replayed', response: this.withToken(replayed) };
    }

    await this.verifyCaptcha(request.captchaToken, command.client.ipAddress);

    const phone = PhoneNumber.parse(request.phone, request.phoneCountry);
    const phoneHash = this.deps.hasher.hash(phone.e164);
    await this.enforcePhoneLimit(phoneHash);

    const promotion = await this.deps.catalog.validate(request.promotionId, request.brand);
    if (!promotion.active || promotion.brand !== request.brand) {
      throw new PromotionNotAvailableError(request.promotionId);
    }
    const specialties = resolveSpecialties(promotion, request.specialtyIds);

    const now = this.deps.clock.now();
    const duplicate = await this.deps.leads.findRecentDuplicate({
      brand: request.brand,
      phoneHash,
      promotionId: request.promotionId,
      since: new Date(now.getTime() - this.duplicateWindowMs),
    });
    if (duplicate) {
      const response = buildLeadResponse(duplicate.toProps(), this.deps.settings, false);
      await this.deps.submissions.record({
        leadId: duplicate.id,
        idempotencyKey: scopedKey,
        requestFingerprint: fingerprint,
        ipHash: command.ipHash,
        userAgent: command.userAgent,
        outcome: 'DUPLICATE',
        responseSnapshot: response,
      });
      await this.cacheSafely(scopedKey, fingerprint, response);
      this.deps.logger.info(
        { leadId: duplicate.id, promotionId: request.promotionId },
        'Solicitud duplicada dentro de la ventana de 24 h; se devuelve el lead existente',
      );
      return { outcome: 'duplicate', response: this.withToken(response) };
    }

    const response = await this.createWithRetries({
      command,
      scopedKey,
      fingerprint,
      phone,
      phoneHash,
      emailHash: this.deps.hasher.hash(normalizeEmail(request.email)),
      promotion,
      specialties,
      now,
    });
    await this.cacheSafely(scopedKey, fingerprint, response);
    this.deps.outboxSignal.notify();
    return { outcome: 'created', response: this.withToken(response) };
  }

  private withToken(response: StoredLeadResponse): CreateLeadResponse {
    return { ...response, statusToken: this.deps.tokens.sign(response.leadId) };
  }

  private async verifyCaptcha(token: string | undefined, remoteIp: string | null): Promise<void> {
    const status = await this.deps.captcha.verify(token, remoteIp);
    if (status === 'invalid') {
      throw new CaptchaInvalidError();
    }
    if (status === 'unavailable') {
      throw new CaptchaUnavailableError();
    }
  }

  private async enforcePhoneLimit(phoneHash: string): Promise<void> {
    const decision = await this.deps.rateLimiter.consume(
      `lead-phone:${phoneHash}`,
      this.deps.settings.phoneRateLimitPerHour,
      HOUR_MS,
    );
    if (!decision.allowed) {
      this.deps.logger.warn({ retryAfterMs: decision.retryAfterMs }, 'Límite por teléfono alcanzado');
      throw new TooManyRequestsError(Math.max(1, Math.ceil(decision.retryAfterMs / 1000)));
    }
  }

  /** Devuelve la respuesta previa si la clave (con alcance de IP) ya se procesó con la misma huella. */
  private async findReplay(scopedKey: string, fingerprint: string): Promise<StoredLeadResponse | null> {
    let cached: { fingerprint: string; response: StoredLeadResponse } | null = null;
    try {
      cached = await this.deps.cache.get(scopedKey);
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'Caché de idempotencia no disponible; se consulta la BD');
    }

    if (!cached) {
      const stored = await this.deps.submissions.findByIdempotencyKey(scopedKey);
      if (!stored) {
        return null;
      }
      if (stored.requestFingerprint !== fingerprint || stored.responseSnapshot === null) {
        throw new IdempotencyKeyReusedError();
      }
      cached = { fingerprint: stored.requestFingerprint, response: stored.responseSnapshot };
      await this.cacheSafely(scopedKey, cached.fingerprint, cached.response);
    }

    if (cached.fingerprint !== fingerprint) {
      throw new IdempotencyKeyReusedError();
    }
    return { ...cached.response, replayed: true };
  }

  private async createWithRetries(input: {
    command: CreateLeadCommand;
    scopedKey: string;
    fingerprint: string;
    phone: PhoneNumber;
    phoneHash: string;
    emailHash: string;
    promotion: CatalogPromotion;
    specialties: LeadSpecialty[];
    now: Date;
  }): Promise<StoredLeadResponse> {
    const { command, promotion, phone, now } = input;
    const { request } = command;
    let lastCollision: ReferenceCollisionError | null = null;

    for (let attempt = 1; attempt <= this.maxReferenceAttempts; attempt += 1) {
      const reference = LeadReference.generate(this.deps.settings.referencePrefix, this.deps.randomIndex);
      const leadId = this.idFactory();
      const eventId = this.idFactory();

      const lead: LeadProps = {
        id: leadId,
        reference: reference.value,
        brand: request.brand,
        promotionId: promotion.id,
        promotionName: promotion.name,
        promotionHeadline: promotion.headline,
        priceAmount: promotion.price.amount,
        campaignId: promotion.campaignId,
        campus: request.campus,
        specialties: input.specialties,
        fullName: request.fullName,
        phoneE164: phone.e164,
        phoneHash: input.phoneHash,
        phoneCountry: phone.country,
        email: request.email,
        emailHash: input.emailHash,
        experiment: request.experiment ? { id: request.experiment.id, variant: request.experiment.variant } : null,
        status: 'REGISTERED',
        crmContactId: null,
        crmConversationId: null,
        crmAdvisorName: null,
        crmSyncedAt: null,
        crmConversationLinkedAt: null,
        feedback: null,
        anonymizedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const response = buildLeadResponse(lead, this.deps.settings, false);
      const aggregate: CreateLeadAggregate = {
        lead,
        consent: {
          contactAccepted: request.consent.contactAccepted,
          marketingAccepted: request.consent.marketingAccepted,
          privacyVersion: request.consent.privacyVersion,
          acceptedAt: now,
          ipHash: command.ipHash,
          userAgent: command.userAgent,
        },
        attribution: request.attribution ?? null,
        submission: {
          leadId,
          idempotencyKey: input.scopedKey,
          requestFingerprint: input.fingerprint,
          ipHash: command.ipHash,
          userAgent: command.userAgent,
          outcome: 'CREATED',
          responseSnapshot: response,
        },
        outboxEvent: {
          id: eventId,
          name: EventNames.LeadCreated,
          version: 1,
          correlationId: leadId,
          payload: buildLeadCreatedPayload(lead, request, command.client, now),
          createdAt: now,
        },
        notification: this.deps.settings.confirmationEmailEnabled
          ? { id: this.idFactory(), channel: 'email', template: CONFIRMATION_EMAIL_TEMPLATE, createdAt: now }
          : null,
      };

      try {
        await this.deps.leads.createWithOutbox(aggregate);
        this.deps.logger.info(
          { leadId, reference: reference.value, promotionId: promotion.id, eventId },
          'Lead registrado y evento encolado en outbox',
        );
        return response;
      } catch (error) {
        if (error instanceof ReferenceCollisionError) {
          lastCollision = error;
          this.deps.logger.warn({ reference: reference.value, attempt }, 'Colisión de referencia; se genera otra');
          continue;
        }
        throw error;
      }
    }

    throw lastCollision ?? new Error('No se pudo generar una referencia única');
  }

  private async cacheSafely(scopedKey: string, fingerprint: string, response: StoredLeadResponse): Promise<void> {
    try {
      await this.deps.cache.set(scopedKey, { fingerprint, response }, this.idempotencyTtlSeconds);
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'No se pudo escribir en la caché de idempotencia');
    }
  }
}

/**
 * Valida `specialtyIds` contra la promoción (A3): cada id debe estar entre las
 * permitidas y la cantidad no puede superar `specialtiesIncluded`. Si
 * promotions-service aún no publica esos campos, solo se acepta la lista vacía.
 */
export function resolveSpecialties(promotion: CatalogPromotion, specialtyIds: readonly string[]): LeadSpecialty[] {
  if (specialtyIds.length === 0) {
    return [];
  }
  if (new Set(specialtyIds).size !== specialtyIds.length) {
    throw new InvalidSpecialtiesError('No repitas especialidades');
  }
  const allowed = promotion.allowedSpecialties;
  const included = promotion.specialtiesIncluded;
  if (!allowed || included === undefined || included === 0) {
    throw new InvalidSpecialtiesError('Esta promoción no permite elegir especialidades');
  }
  if (specialtyIds.length > included) {
    throw new InvalidSpecialtiesError(
      included === 1 ? 'Esta promoción incluye 1 especialidad' : `Esta promoción incluye hasta ${included} especialidades`,
    );
  }
  const byId = new Map(allowed.map((specialty) => [specialty.id, specialty]));
  return specialtyIds.map((id) => {
    const specialty = byId.get(id);
    if (!specialty) {
      throw new InvalidSpecialtiesError('Alguna especialidad elegida no está disponible en esta promoción');
    }
    return { id: specialty.id, name: specialty.name };
  });
}

/** Payload de `lead.created.v1` (A4, A3, A17): `client` solo con consentimiento de publicidad. */
export function buildLeadCreatedPayload(
  lead: LeadProps,
  request: CreateLeadRequest,
  client: LeadClientContext,
  now: Date,
): LeadCreatedPayload {
  const marketingAccepted = request.consent.marketingAccepted;
  const clientData = marketingAccepted
    ? {
        ipAddress: clip(client.ipAddress, 64),
        userAgent: clip(client.userAgent, 512),
        fbc: clip(client.fbc, 256),
        fbp: clip(client.fbp, 256),
        eventSourceUrl: clip(client.eventSourceUrl, 500),
      }
    : undefined;
  return LeadCreatedPayloadSchema.parse({
    leadId: lead.id,
    reference: lead.reference,
    brand: lead.brand,
    fullName: lead.fullName,
    phone: lead.phoneE164,
    email: lead.email,
    campus: lead.campus,
    promotion: {
      id: lead.promotionId,
      name: lead.promotionName,
      headline: lead.promotionHeadline,
      campaignId: lead.campaignId,
      priceAmount: lead.priceAmount ?? undefined,
    },
    specialties: lead.specialties,
    consent: {
      contactAccepted: request.consent.contactAccepted,
      marketingAccepted,
      privacyVersion: request.consent.privacyVersion,
      acceptedAt: now.toISOString(),
    },
    attribution: request.attribution,
    client: clientData,
    createdAt: now.toISOString(),
  });
}
