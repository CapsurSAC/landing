import { type SyncJob, type SyncJobStatus } from '../../domain/sync-job';
import { type LoggerPort, noopLogger } from '../ports/logger';
import { type SyncJobRepository } from '../ports/repositories';
import { type SyncLeadToChatwoot } from './sync-lead-to-chatwoot';

export interface RetryFailedSyncsInput {
  leadId?: string;
  status?: Extract<SyncJobStatus, 'FAILED' | 'DEAD'>;
  limit?: number;
}

export interface RetryFailedSyncsResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Reproceso manual: vuelve a ejecutar `SyncLeadToChatwoot` con el payload almacenado (cifrado)
 * en `sync_jobs`. Si el reintento falla de forma reintentable, el trabajo recupera su estado
 * anterior (FAILED/DEAD) con el nuevo error, para que nada quede en PENDING sin dueño. Los
 * trabajos anonimizados (sin payload) no se pueden reprocesar y cuentan como fallidos.
 */
export class RetryFailedSyncs {
  private readonly logger: LoggerPort;

  constructor(private readonly deps: { syncJobs: SyncJobRepository; syncLead: SyncLeadToChatwoot; logger?: LoggerPort }) {
    this.logger = deps.logger ?? noopLogger;
  }

  async execute(input: RetryFailedSyncsInput): Promise<RetryFailedSyncsResult> {
    const jobs = await this.select(input);
    const result: RetryFailedSyncsResult = { attempted: 0, succeeded: 0, failed: 0 };

    for (const job of jobs) {
      result.attempted += 1;
      if (!job.payload) {
        result.failed += 1;
        this.logger.warn('Trabajo sin payload (lead anonimizado); no se puede reprocesar', { leadId: job.leadId });
        continue;
      }
      const attempt = job.attempts + 1;
      try {
        const outcome = await this.deps.syncLead.execute({
          eventId: job.eventId,
          payload: job.payload,
          attempt,
          // El reproceso manual nunca marca DEAD por sí mismo: el operador decide.
          maxAttempts: Number.POSITIVE_INFINITY,
          force: true,
        });
        if (outcome.status === 'synced' || (outcome.status === 'skipped' && outcome.reason === 'already_processed')) {
          result.succeeded += 1;
        } else {
          result.failed += 1;
        }
      } catch (error) {
        result.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        const previous: SyncJobStatus = job.status === 'SUCCEEDED' || job.status === 'PENDING' ? 'FAILED' : job.status;
        await this.deps.syncJobs.update(job.leadId, { status: previous, attempts: attempt, lastError: message });
        this.logger.warn('Reproceso manual fallido', { leadId: job.leadId, attempt, error: message });
      }
    }

    this.logger.info('Reproceso manual terminado', { ...result });
    return result;
  }

  private async select(input: RetryFailedSyncsInput): Promise<SyncJob[]> {
    if (input.leadId) {
      const job = await this.deps.syncJobs.findByLeadId(input.leadId);
      return job ? [job] : [];
    }
    const statuses: SyncJobStatus[] = input.status ? [input.status] : ['FAILED', 'DEAD'];
    return this.deps.syncJobs.list({ statuses, limit: input.limit ?? 50 });
  }
}
