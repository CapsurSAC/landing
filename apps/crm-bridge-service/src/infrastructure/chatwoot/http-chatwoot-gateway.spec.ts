import { HttpChatwootGateway } from './http-chatwoot-gateway';

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function fakeFetch(responder: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call: Call = { method: init?.method ?? 'GET', url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const { status, body } = responder(call);
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  };
  return { calls, fetchImpl: fetchImpl as typeof fetch };
}

const options = { baseUrl: 'https://chat.sis.edu.pe/', accountId: '7', apiAccessToken: 'tok', configured: true };
const BASE = 'https://chat.sis.edu.pe/api/v1/accounts/7';

describe('HttpChatwootGateway', () => {
  it('cuenta conversaciones abiertas por agente paginando hasta una página vacía', async () => {
    const pages: Record<string, unknown[]> = {
      '1': [{ id: 1, meta: { assignee: { id: 11 } } }, { id: 2, meta: { assignee: { id: 12 } } }, { id: 3, meta: { assignee: null } }],
      '2': [{ id: 4, assignee_id: 11 }],
    };
    const { calls, fetchImpl } = fakeFetch((call) => {
      const page = new URL(call.url).searchParams.get('page') ?? '';
      return { status: 200, body: { data: { meta: {}, payload: pages[page] ?? [] } } };
    });
    const gateway = new HttpChatwootGateway(options, fetchImpl);

    const counts = await gateway.countOpenConversationsByAssignee();

    expect(Object.fromEntries(counts)).toEqual({ 11: 2, 12: 1 });
    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/conversations?assignee_type=all&status=open&page=1`,
      `${BASE}/conversations?assignee_type=all&status=open&page=2`,
      `${BASE}/conversations?assignee_type=all&status=open&page=3`,
    ]);
  });

  it('lista agentes con nombre visible y disponibilidad', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      status: 200,
      body: [
        { id: 11, name: 'Ana Pérez', available_name: 'Ana', availability_status: 'online' },
        { id: 12, name: 'Beto', availability_status: 'busy' },
      ],
    }));
    const agents = await new HttpChatwootGateway(options, fetchImpl).listAgents();
    expect(agents).toEqual([
      { id: 11, name: 'Ana', availabilityStatus: 'online' },
      { id: 12, name: 'Beto', availabilityStatus: 'busy' },
    ]);
  });

  it('crea la conversación con plantilla con el cuerpo que espera Chatwoot', async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({ status: 200, body: { id: 900, inbox_id: 2 } }));
    const result = await new HttpChatwootGateway(options, fetchImpl).createTemplateConversation({
      inboxId: 2,
      contactId: '501',
      content: 'Hola María',
      template: { name: 'sis_catalogo', category: 'UTILITY', language: 'es', processedParams: { '1': 'María' } },
    });

    expect(result).toEqual({ conversationId: '900' });
    expect(calls[0]).toEqual({
      method: 'POST',
      url: `${BASE}/conversations`,
      body: {
        inbox_id: 2,
        contact_id: '501',
        message: {
          content: 'Hola María',
          template_params: { name: 'sis_catalogo', category: 'UTILITY', language: 'es', processed_params: { '1': 'María' } },
        },
      },
    });
  });

  it('mensaje saliente y borrado de contacto (404 = not_found)', async () => {
    const { calls, fetchImpl } = fakeFetch((call) => ({ status: call.method === 'DELETE' ? 404 : 200, body: {} }));
    const gateway = new HttpChatwootGateway(options, fetchImpl);

    await gateway.sendOutgoingMessage('42', 'hola');
    expect(calls[0]).toEqual({ method: 'POST', url: `${BASE}/conversations/42/messages`, body: { content: 'hola', message_type: 'outgoing', private: false } });
    expect(await gateway.deleteContact('501')).toBe('not_found');
  });

  it('los errores nunca incluyen la query (el teléfono de la búsqueda)', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 500, body: { error: 'boom' } }));
    const gateway = new HttpChatwootGateway(options, fetchImpl);

    await expect(gateway.findContactByPhone('+51987654321')).rejects.toMatchObject({ kind: 'retryable', httpStatus: 500 });
    await gateway.findContactByPhone('+51987654321').catch((error: Error) => {
      expect(error.message).not.toContain('987654321');
    });
  });
});
