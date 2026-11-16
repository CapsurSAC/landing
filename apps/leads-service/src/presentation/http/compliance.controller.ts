import { Body, Controller, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ComplaintRequestSchema,
  ComplaintResponseSchema,
  PrivacyRequestResponseSchema,
  PrivacyRequestSchema,
  type ComplaintRequest,
  type ComplaintResponse,
  type PrivacyRequest,
  type PrivacyRequestResponse,
} from '@capsur/api-contracts';
import { ProblemException, ZodValidationPipe } from '@capsur/nest-kit';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { RATE_LIMITER, type RateLimiter } from '../../application/ports/security';
import type { SubmitComplaint, SubmitPrivacyRequest } from '../../application/use-cases/compliance';
import { SUBMIT_COMPLAINT, SUBMIT_PRIVACY_REQUEST } from '../../application/use-cases/tokens';
import { ENV, type Env } from '../../config/env';
import { ProblemDetailsOpenApi, zodToOpenApi } from './openapi';
import { clientIp, clientIpHash } from './request-context';

const HOUR_MS = 60 * 60 * 1000;

function honeypotTriggered(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const website = (body as { website?: unknown }).website;
  return typeof website === 'string' && website.trim().length > 0;
}

/**
 * Libro de Reclamaciones (A5) y derechos ARCO (C9). Límite propio de
 * `COMPLIANCE_RATE_LIMIT_PER_HOUR` (5) por IP y hora, compartido en Redis.
 */
@ApiTags('compliance')
@Controller('api/v1')
export class ComplianceController {
  private readonly complaintPipe = new ZodValidationPipe<ComplaintRequest>(ComplaintRequestSchema);
  private readonly privacyPipe = new ZodValidationPipe<PrivacyRequest>(PrivacyRequestSchema);

  constructor(
    @Inject(SUBMIT_COMPLAINT) private readonly submitComplaint: SubmitComplaint,
    @Inject(SUBMIT_PRIVACY_REQUEST) private readonly submitPrivacyRequest: SubmitPrivacyRequest,
    @Inject(RATE_LIMITER) private readonly rateLimiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  @Post('complaints')
  @ApiOperation({ summary: 'Registra un reclamo o queja (código SIS-LR-<año>-<6 dígitos>, respuesta en 15 días hábiles)' })
  @ApiBody({ schema: zodToOpenApi(ComplaintRequestSchema, 'input') })
  @ApiResponse({ status: 201, schema: zodToOpenApi(ComplaintResponseSchema) })
  @ApiResponse({ status: 204, description: 'Honeypot activado; no se persiste nada' })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED, CAPTCHA_INVALID', schema: ProblemDetailsOpenApi })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED (5 por hora e IP)', schema: ProblemDetailsOpenApi })
  @ApiResponse({ status: 503, description: 'CAPTCHA_UNAVAILABLE', schema: ProblemDetailsOpenApi })
  async complaint(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ComplaintResponse | undefined> {
    if (honeypotTriggered(body)) {
      this.logger.warn({ context: ComplianceController.name }, 'Honeypot activado en reclamos; solicitud descartada');
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    const validated = this.complaintPipe.transform(body);
    const ipHash = clientIpHash(request, this.env.IP_HASH_PEPPER);
    await this.enforceIpLimit('complaints', ipHash);
    response.status(HttpStatus.CREATED);
    return this.submitComplaint.execute({ request: validated, ipHash, remoteIp: clientIp(request) });
  }

  @Post('privacy/requests')
  @ApiOperation({ summary: 'Registra una solicitud ARCO (código SIS-ARCO-<año>-<6 dígitos>, respuesta en 20 días hábiles)' })
  @ApiBody({ schema: zodToOpenApi(PrivacyRequestSchema, 'input') })
  @ApiResponse({ status: 201, schema: zodToOpenApi(PrivacyRequestResponseSchema) })
  @ApiResponse({ status: 204, description: 'Honeypot activado; no se persiste nada' })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED, CAPTCHA_INVALID', schema: ProblemDetailsOpenApi })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED (5 por hora e IP)', schema: ProblemDetailsOpenApi })
  @ApiResponse({ status: 503, description: 'CAPTCHA_UNAVAILABLE', schema: ProblemDetailsOpenApi })
  async privacyRequest(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PrivacyRequestResponse | undefined> {
    if (honeypotTriggered(body)) {
      this.logger.warn({ context: ComplianceController.name }, 'Honeypot activado en ARCO; solicitud descartada');
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    const validated = this.privacyPipe.transform(body);
    const ipHash = clientIpHash(request, this.env.IP_HASH_PEPPER);
    await this.enforceIpLimit('privacy', ipHash);
    response.status(HttpStatus.CREATED);
    return this.submitPrivacyRequest.execute({ request: validated, ipHash, remoteIp: clientIp(request) });
  }

  private async enforceIpLimit(scope: string, ipHash: string | null): Promise<void> {
    const decision = await this.rateLimiter.consume(
      `${scope}:${ipHash ?? 'unknown'}`,
      this.env.COMPLIANCE_RATE_LIMIT_PER_HOUR,
      HOUR_MS,
    );
    if (!decision.allowed) {
      throw new ProblemException({
        status: 429,
        title: 'Demasiadas solicitudes',
        code: 'RATE_LIMITED',
        detail: 'Has enviado demasiadas solicitudes. Inténtalo de nuevo más tarde.',
        headers: { 'Retry-After': String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))) },
      });
    }
  }
}
