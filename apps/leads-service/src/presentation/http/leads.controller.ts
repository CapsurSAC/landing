import { Body, Controller, Get, Header, HttpCode, HttpStatus, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CreateLeadRequestSchema,
  CreateLeadResponseSchema,
  IDEMPOTENCY_KEY_PATTERN,
  LEAD_TOKEN_HEADER,
  LeadFeedbackRequestSchema,
  LeadStatusResponseSchema,
  type CreateLeadRequest,
  type CreateLeadResponse,
  type LeadFeedbackRequest,
  type LeadStatusResponse,
} from '@capsur/api-contracts';
import { ProblemException, ZodValidationPipe } from '@capsur/nest-kit';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import type { CreateLead } from '../../application/use-cases/create-lead';
import type { GetLeadStatus } from '../../application/use-cases/get-lead-status';
import type { SubmitLeadFeedback } from '../../application/use-cases/submit-lead-feedback';
import { CREATE_LEAD, GET_LEAD_STATUS, SUBMIT_LEAD_FEEDBACK } from '../../application/use-cases/tokens';
import { ENV, type Env } from '../../config/env';
import { LeadNotFoundError } from '../../domain/errors';
import { ProblemDetailsOpenApi, zodToOpenApi } from './openapi';
import { clientIpHash, headerOf, leadClientContext, userAgentOf } from './request-context';

const LeadIdSchema = z.uuid();
export const STATUS_RATE_LIMIT_PER_MINUTE = 60;

/** El honeypot se evalúa sobre el cuerpo crudo, antes de la validación. */
function honeypotTriggered(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const website = (body as { website?: unknown }).website;
  return typeof website === 'string' && website.trim().length > 0;
}

/** Un id que no es UUID se trata igual que uno inexistente (C18: no revelar nada). */
function assertLeadId(leadId: string): void {
  if (!LeadIdSchema.safeParse(leadId).success) {
    throw new LeadNotFoundError(leadId);
  }
}

@ApiTags('leads')
@Controller('api/v1/leads')
export class LeadsController {
  private readonly bodyPipe = new ZodValidationPipe<CreateLeadRequest>(CreateLeadRequestSchema);

  constructor(
    @Inject(CREATE_LEAD) private readonly createLead: CreateLead,
    @Inject(GET_LEAD_STATUS) private readonly getLeadStatus: GetLeadStatus,
    @Inject(SUBMIT_LEAD_FEEDBACK) private readonly submitLeadFeedback: SubmitLeadFeedback,
    @Inject(ENV) private readonly env: Env,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Registra una solicitud de información (lead)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'UUID único por envío del formulario. Reenviarlo desde la misma IP devuelve la misma respuesta (C19).',
  })
  @ApiBody({ schema: zodToOpenApi(CreateLeadRequestSchema, 'input') })
  @ApiResponse({ status: 201, description: 'Lead registrado', schema: zodToOpenApi(CreateLeadResponseSchema) })
  @ApiResponse({
    status: 200,
    description: 'Replay por Idempotency-Key (cabecera Idempotent-Replayed: true) o duplicado en 24 h',
    schema: zodToOpenApi(CreateLeadResponseSchema),
  })
  @ApiResponse({ status: 204, description: 'Honeypot activado; no se persiste nada' })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_FAILED, INVALID_PHONE, INVALID_SPECIALTIES, IDEMPOTENCY_KEY_INVALID, CAPTCHA_INVALID',
    schema: ProblemDetailsOpenApi,
  })
  @ApiResponse({ status: 422, description: 'PROMOTION_NOT_AVAILABLE, IDEMPOTENCY_KEY_REUSED', schema: ProblemDetailsOpenApi })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED (por IP o por teléfono)', schema: ProblemDetailsOpenApi })
  @ApiResponse({
    status: 503,
    description: 'CATALOG_UNAVAILABLE o CAPTCHA_UNAVAILABLE (Retry-After: 5)',
    schema: ProblemDetailsOpenApi,
  })
  async create(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateLeadResponse | undefined> {
    if (honeypotTriggered(body)) {
      this.logger.warn({ context: LeadsController.name }, 'Honeypot activado; solicitud descartada');
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }

    const idempotencyKey = headerOf(request, 'idempotency-key')?.trim() ?? '';
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new ProblemException({
        status: 400,
        title: 'Idempotency-Key inválida',
        code: 'IDEMPOTENCY_KEY_INVALID',
        detail: 'Envía la cabecera Idempotency-Key con un UUID nuevo por cada envío del formulario.',
      });
    }

    const validated = this.bodyPipe.transform(body);
    const result = await this.createLead.execute({
      idempotencyKey: idempotencyKey.toLowerCase(),
      request: validated,
      ipHash: clientIpHash(request, this.env.IP_HASH_PEPPER),
      userAgent: userAgentOf(request),
      client: leadClientContext(request),
    });

    switch (result.outcome) {
      case 'created':
        response.status(HttpStatus.CREATED);
        break;
      case 'replayed':
        response.status(HttpStatus.OK);
        response.setHeader('Idempotent-Replayed', 'true');
        break;
      case 'duplicate':
        response.status(HttpStatus.OK);
        break;
    }
    return result.response;
  }

  @Get(':leadId/status')
  @Throttle({ default: { limit: STATUS_RATE_LIMIT_PER_MINUTE, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Estado de sincronización del lead (sin datos personales); exige x-lead-token' })
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiHeader({ name: LEAD_TOKEN_HEADER, required: true, description: '`statusToken` devuelto al crear el lead (C18)' })
  @ApiResponse({ status: 200, schema: zodToOpenApi(LeadStatusResponseSchema) })
  @ApiResponse({
    status: 404,
    description: 'LEAD_NOT_FOUND: inexistente, token ausente o token incorrecto (misma respuesta)',
    schema: ProblemDetailsOpenApi,
  })
  async status(@Param('leadId') leadId: string, @Req() request: Request): Promise<LeadStatusResponse> {
    assertLeadId(leadId);
    return this.getLeadStatus.execute(leadId, headerOf(request, LEAD_TOKEN_HEADER));
  }

  @Post(':leadId/feedback')
  @HttpCode(201)
  @ApiOperation({ summary: '«¿Cómo nos conociste?» (A21): una sola respuesta por lead; exige x-lead-token' })
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiHeader({ name: LEAD_TOKEN_HEADER, required: true, description: '`statusToken` devuelto al crear el lead' })
  @ApiBody({ schema: zodToOpenApi(LeadFeedbackRequestSchema, 'input') })
  @ApiResponse({ status: 201, schema: { type: 'object', properties: { accepted: { type: 'boolean', enum: [true] } } } })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED', schema: ProblemDetailsOpenApi })
  @ApiResponse({ status: 404, description: 'LEAD_NOT_FOUND', schema: ProblemDetailsOpenApi })
  @ApiResponse({ status: 409, description: 'FEEDBACK_ALREADY_SUBMITTED', schema: ProblemDetailsOpenApi })
  async feedback(
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe<LeadFeedbackRequest>(LeadFeedbackRequestSchema)) body: LeadFeedbackRequest,
    @Req() request: Request,
  ): Promise<{ accepted: true }> {
    assertLeadId(leadId);
    await this.submitLeadFeedback.execute(leadId, headerOf(request, LEAD_TOKEN_HEADER), body);
    return { accepted: true };
  }
}
