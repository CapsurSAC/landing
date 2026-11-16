import { type MetaEventsRequest } from '../../domain/meta-capi';

export interface MetaCapiResponse {
  eventsReceived: number;
  fbtraceId: string | null;
}

/**
 * Puerto hacia Meta Conversions API (A17). Lanza `IntegrationError` clasificado:
 * 429/5xx/red/timeout o `is_transient` → reintentable; resto de 4xx → definitivo.
 */
export interface MetaCapiClient {
  sendEvents(request: MetaEventsRequest): Promise<MetaCapiResponse>;
}
