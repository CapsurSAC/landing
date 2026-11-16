import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { type IntegrationSummary } from '@capsur/api-contracts';
import { Audited, type InternalRequest, ZodValidationPipe } from '@capsur/nest-kit';
import { type SyncJobRepository } from '../../application/ports/repositories';
import { SYNC_JOB_REPOSITORY } from '../../application/ports/tokens';
import { GetIntegrationSummary } from '../../application/use-cases/get-integration-summary';
import { RetryFailedSyncs, type RetryFailedSyncsResult } from '../../application/use-cases/retry-failed-syncs';
import { type SyncJobSummary } from '../../domain/sync-job';
import { type JobsQuery, JobsQuerySchema, type RetryRequest, RetryRequestSchema } from './schemas';

/** Destino auditado del reproceso: el lead concreto o el estado reprocesado. */
function retryTarget(request: InternalRequest): string {
  const parsed = RetryRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return 'invalid';
  }
  return parsed.data.leadId ?? `status:${parsed.data.status ?? 'FAILED+DEAD'}`;
}

/**
 * Operación de integraciones (`/internal/*`: token de `INTERNAL_API_TOKENS` exigido por el
 * guard global del kit). Documentado en `openapi.ts`.
 */
@ApiExcludeController()
@Controller('internal/integrations')
export class InternalIntegrationsController {
  constructor(
    @Inject(RetryFailedSyncs) private readonly retryFailedSyncs: RetryFailedSyncs,
    @Inject(GetIntegrationSummary) private readonly summary: GetIntegrationSummary,
    @Inject(SYNC_JOB_REPOSITORY) private readonly syncJobs: SyncJobRepository,
  ) {}

  @Post('retry')
  @HttpCode(200)
  @Audited('integrations.retry', { target: retryTarget })
  async retry(@Body(new ZodValidationPipe(RetryRequestSchema)) body: RetryRequest): Promise<RetryFailedSyncsResult> {
    return this.retryFailedSyncs.execute(body);
  }

  @Get('jobs')
  async jobs(@Query(new ZodValidationPipe(JobsQuerySchema)) query: JobsQuery): Promise<{ items: SyncJobSummary[] }> {
    const items = await this.syncJobs.listSummaries({ statuses: query.status ? [query.status] : undefined, limit: query.limit });
    return { items };
  }

  @Get('summary')
  async getSummary(): Promise<IntegrationSummary> {
    return this.summary.execute();
  }
}
