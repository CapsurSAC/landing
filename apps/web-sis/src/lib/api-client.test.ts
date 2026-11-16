import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiRequestError, fetchLeadStatus, submitLead, submitLeadFeedback } from './api-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api-client', () => {
  test('consulta el estado enviando x-lead-token (C18)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { leadId: 'abc', reference: 'SIS-7K3M2', status: 'crm_synced', updatedAt: '2026-11-13T12:00:00.000Z' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const status = await fetchLeadStatus('abc', 'token-firmado-1234567890');
    expect(status.status).toBe('crm_synced');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/leads/abc/status');
    expect((init.headers as Record<string, string>)['x-lead-token']).toBe('token-firmado-1234567890');
  });

  test('la encuesta trata 409 (ya respondida) como éxito', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, { title: 'Conflicto', status: 409 })));
    await expect(submitLeadFeedback('abc', 'token-firmado-1234567890', { source: 'facebook' })).resolves.toBeUndefined();
  });

  test('convierte un problema RFC 9457 en errores por campo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, {
          title: 'Datos inválidos',
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [
            { path: 'specialtyIds', message: 'Elige como máximo 1 especialidad' },
            { path: 'consumer.email', message: 'Correo inválido' },
          ],
        }),
      ),
    );
    const error = await submitLead({} as never, '0b4cf28e-10c8-4a00-8cc6-510c6d5b772d').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    const apiError = error as ApiRequestError;
    expect(apiError.code).toBe('VALIDATION_FAILED');
    expect(apiError.fieldErrors.specialtyIds).toMatch(/máximo 1/);
    expect(apiError.fieldErrors['consumer.email']).toBe('Correo inválido');
    expect(apiError.fieldErrors.consumer).toBe('Correo inválido');
  });
});
