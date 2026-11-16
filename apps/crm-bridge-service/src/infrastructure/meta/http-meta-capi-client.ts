import { z } from 'zod';
import { IntegrationError } from '../../domain/integration-error';
import { type MetaEventsRequest } from '../../domain/meta-capi';
import { type MetaCapiClient, type MetaCapiResponse } from '../../application/ports/meta-capi-client';

type FetchLike = typeof globalThis.fetch;

export interface HttpMetaCapiClientOptions {
  /** Por defecto `https://graph.facebook.com/v21.0`. */
  baseUrl: string;
  pixelId: string;
  accessToken: string;
  timeoutMs?: number;
}

const SuccessSchema = z.looseObject({
  events_received: z.number().int().optional(),
  fbtrace_id: z.string().optional(),
});
const ErrorSchema = z.looseObject({
  error: z
    .looseObject({
      message: z.string().optional(),
      type: z.string().optional(),
      code: z.number().optional(),
      is_transient: z.boolean().optional(),
      fbtrace_id: z.string().optional(),
    })
    .optional(),
});

/**
 * Cliente de Meta Conversions API: `POST {base}/{pixelId}/events`. El token viaja en el
 * cuerpo (`access_token`), nunca en la URL, para que no aparezca en logs de proxies.
 */
export class HttpMetaCapiClient implements MetaCapiClient {
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly options: HttpMetaCapiClientOptions,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    this.url = `${options.baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(options.pixelId)}/events`;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  async sendEvents(request: MetaEventsRequest): Promise<MetaCapiResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ ...request, access_token: this.options.accessToken }),
        signal: controller.signal,
        redirect: 'error',
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw IntegrationError.retryable(`Timeout (${this.timeoutMs} ms) llamando a Meta Conversions API`, { code: 'META_TIMEOUT', cause: error });
      }
      const message = error instanceof Error ? error.message : String(error);
      throw IntegrationError.retryable(`Error de red llamando a Meta Conversions API: ${message}`, { code: 'META_NETWORK', cause: error });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let json: unknown = null;
    try {
      json = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const parsed = ErrorSchema.safeParse(json);
      const graphError = parsed.success ? parsed.data.error : undefined;
      const detail = graphError?.message ?? text.slice(0, 200);
      const message = `Meta respondió ${response.status}${graphError?.code !== undefined ? ` (código ${graphError.code})` : ''}: ${detail}`;
      // Meta marca como transitorios algunos 4xx (límite de llamadas): se reintentan.
      if (graphError?.is_transient === true) {
        throw IntegrationError.retryable(message, { httpStatus: response.status, code: 'META_TRANSIENT' });
      }
      throw IntegrationError.fromHttpStatus(response.status, message, { code: 'META_HTTP_ERROR' });
    }

    const parsed = SuccessSchema.safeParse(json);
    return {
      eventsReceived: parsed.success ? (parsed.data.events_received ?? 0) : 0,
      fbtraceId: parsed.success ? (parsed.data.fbtrace_id ?? null) : null,
    };
  }
}
