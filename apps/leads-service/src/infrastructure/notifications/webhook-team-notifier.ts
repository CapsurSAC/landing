import type { TeamNotifier } from '../../application/ports/notifications';

/**
 * POST `{ text }` a un webhook compatible con Slack (A20). Timeout de 5 s;
 * cualquier respuesta no 2xx es un error (el planificador lo registra).
 */
export class WebhookTeamNotifier implements TeamNotifier {
  constructor(
    private readonly url: string,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs = 5000,
  ) {}

  async postText(text: string): Promise<void> {
    const response = await this.fetchFn(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`El webhook del reporte diario respondió HTTP ${response.status}`);
    }
  }
}
