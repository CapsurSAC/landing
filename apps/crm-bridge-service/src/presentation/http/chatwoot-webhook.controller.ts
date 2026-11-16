import { Body, Controller, Headers, HttpCode, Inject, Post, Query, type RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ProblemException, Public } from '@capsur/nest-kit';
import { type Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { HandleChatwootWebhook } from '../../application/use-cases/handle-chatwoot-webhook';
import { IpAllowlist } from '../../infrastructure/security/ip-allowlist';
import { WebhookSignatureVerifier } from '../../infrastructure/security/webhook-signature-verifier';
import { type WebhookAccepted } from './schemas';

function single(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * `POST /webhooks/chatwoot`: público (fuera de `/internal`), con verificación propia:
 * 1. allowlist de IP (C7) sobre la IP real (`trust proxy` = 1) → 403;
 * 2. `?token=` o `x-chatwoot-signature` contra el secreto vigente o el anterior (rotación) → 401.
 * Conserva `rawBody` para el HMAC (NestFactory con `rawBody: true`). Documentado en `openapi.ts`.
 */
@ApiExcludeController()
@Public()
@Controller('webhooks')
export class ChatwootWebhookController {
  constructor(
    @Inject(WebhookSignatureVerifier) private readonly verifier: WebhookSignatureVerifier,
    @Inject(IpAllowlist) private readonly ipAllowlist: IpAllowlist,
    @Inject(HandleChatwootWebhook) private readonly handler: HandleChatwootWebhook,
    @InjectPinoLogger(ChatwootWebhookController.name) private readonly logger: PinoLogger,
  ) {}

  @Post('chatwoot')
  @HttpCode(202)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Query('token') tokenParam?: unknown,
    @Headers('x-chatwoot-signature') signatureHeader?: unknown,
  ): Promise<WebhookAccepted> {
    const ip = request.ip ?? request.socket.remoteAddress;
    if (!this.ipAllowlist.allows(ip)) {
      this.logger.warn({ ip }, 'Webhook de Chatwoot rechazado: IP fuera de WEBHOOK_IP_ALLOWLIST');
      throw new ProblemException({
        status: 403,
        title: 'Prohibido',
        code: 'WEBHOOK_IP_FORBIDDEN',
        detail: 'Origen no permitido para el webhook.',
      });
    }

    const token = single(tokenParam);
    const signature = single(signatureHeader);
    const rawBody = request.rawBody ?? Buffer.alloc(0);
    const verification = this.verifier.verify({ token, signature, rawBody });
    if (!verification) {
      this.logger.warn({ ip, hasToken: Boolean(token), hasSignature: Boolean(signature) }, 'Webhook de Chatwoot rechazado: autenticación inválida');
      throw new ProblemException({
        status: 401,
        title: 'No autorizado',
        code: 'INVALID_WEBHOOK_AUTH',
        detail: 'Token o firma del webhook inválidos.',
      });
    }
    if (verification.secret === 'previous') {
      this.logger.warn(
        { method: verification.method },
        'Webhook autenticado con CHATWOOT_WEBHOOK_SECRET_PREVIOUS: termina la rotación actualizando la URL en Chatwoot',
      );
    }

    const result = await this.handler.execute(body);
    return { accepted: true, outcome: result.outcome, ...(result.reason ? { reason: result.reason } : {}) };
  }
}
