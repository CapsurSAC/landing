import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TrackingEventRequestSchema, type TrackingEventRequest } from '@capsur/api-contracts';
import { ZodValidationPipe } from '@capsur/nest-kit';
import type { RecordTrackingEvent } from '../../application/use-cases/record-tracking-event';
import { RECORD_TRACKING_EVENT } from '../../application/use-cases/tokens';
import { ProblemDetailsOpenApi, zodToOpenApi } from './openapi';

export const TRACKING_RATE_LIMIT_PER_MINUTE = 60;

@ApiTags('tracking')
@Controller('api/v1/tracking')
export class TrackingController {
  constructor(@Inject(RECORD_TRACKING_EVENT) private readonly recordTrackingEvent: RecordTrackingEvent) {}

  @Post('events')
  @HttpCode(202)
  @Throttle({ default: { limit: TRACKING_RATE_LIMIT_PER_MINUTE, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registra un evento de tracking autorizado (sin datos personales), con experimento (A18)' })
  @ApiBody({ schema: zodToOpenApi(TrackingEventRequestSchema, 'input') })
  @ApiResponse({ status: 202, schema: { type: 'object', properties: { accepted: { type: 'boolean', enum: [true] } } } })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED', schema: ProblemDetailsOpenApi })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED', schema: ProblemDetailsOpenApi })
  async record(
    @Body(new ZodValidationPipe<TrackingEventRequest>(TrackingEventRequestSchema)) body: TrackingEventRequest,
  ): Promise<{ accepted: true }> {
    await this.recordTrackingEvent.execute(body);
    return { accepted: true };
  }
}
