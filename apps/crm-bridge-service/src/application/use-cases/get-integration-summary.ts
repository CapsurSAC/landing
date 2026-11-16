import { type IntegrationSummary, Queues } from '@capsur/api-contracts';
import { type LoggerPort, noopLogger } from '../ports/logger';
import { type QueueInspector } from '../ports/queue-inspector';
import { type ContactLinkRepository, type SyncJobRepository } from '../ports/repositories';

/** Todas las colas del servicio (incluidas `.retry` y `.dlq`). */
export const SERVICE_QUEUES: readonly string[] = [
  Queues.CrmBridgeLeadCreated,
  Queues.CrmBridgeLeadCreatedRetry,
  Queues.CrmBridgeLeadCreatedDlq,
  Queues.CrmBridgeLeadFeedback,
  Queues.CrmBridgeLeadAnonymized,
  Queues.CrmBridgeMetaCapi,
  Queues.CrmBridgeMetaCapiRetry,
  Queues.CrmBridgeMetaCapiDlq,
];

/**
 * A27: resumen para el panel. Una cola que no se puede consultar (broker caído o cola
 * inexistente) se omite de `queues` y se registra un aviso.
 */
export class GetIntegrationSummary {
  private readonly logger: LoggerPort;

  constructor(
    private readonly deps: {
      syncJobs: SyncJobRepository;
      contactLinks: ContactLinkRepository;
      queues: QueueInspector;
      chatwootConfigured: boolean;
      logger?: LoggerPort;
    },
  ) {
    this.logger = deps.logger ?? noopLogger;
  }

  async execute(): Promise<IntegrationSummary> {
    const [jobs, lastSyncAt, queues] = await Promise.all([
      this.deps.syncJobs.countByStatus(),
      this.deps.contactLinks.latestSyncedAt(),
      this.queueStats(),
    ]);
    return {
      jobs,
      queues,
      lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
      chatwootConfigured: this.deps.chatwootConfigured,
    };
  }

  private async queueStats(): Promise<IntegrationSummary['queues']> {
    const results = await Promise.all(
      SERVICE_QUEUES.map(async (name) => {
        try {
          const stats = await this.deps.queues.stats(name);
          return { name, messages: stats.messageCount, consumers: stats.consumerCount };
        } catch (error) {
          this.logger.warn('No se pudo consultar la cola', { queue: name, error: error instanceof Error ? error.message : String(error) });
          return null;
        }
      }),
    );
    return results.filter((item): item is IntegrationSummary['queues'][number] => item !== null);
  }
}
