import type { NextRequest } from 'next/server';
import { limaDay } from '@/lib/dates';
import { parseLeadFilters } from '@/lib/lead-filters';
import { can } from '@/lib/roles';
import { exportLeadsCsv } from '@/lib/server/api';
import { getCurrentUser } from '@/lib/server/auth';
import { brand } from '@/lib/server/env';
import { audit } from '@/lib/server/log';
import { errorFromResponse } from '@/lib/server/services';

/**
 * Exportación CSV (solo admin). Reenvía en streaming la respuesta de
 * `GET /internal/admin/leads.csv` con los mismos filtros de la lista; el token
 * de servicio nunca sale del servidor.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return plain(401, 'Tu sesión caducó. Vuelve a iniciar sesión.');
  if (!can(user.role, 'leads:export')) return plain(403, 'Tu rol no permite exportar leads.');

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseLeadFilters(sp);
  const result = await exportLeadsCsv(filters, user.email);
  if (!result.ok) return plain(502, result.error.message);
  const { response } = result;
  if (!response.ok || !response.body) {
    const error = await errorFromResponse('leads', '/internal/admin/leads.csv', response);
    return plain(502, error.message);
  }

  audit('admin.leads.export', user.email, {
    filters: { ...filters, q: filters.q ? '[búsqueda]' : undefined },
  });
  const filename = `leads-${brand()}-${limaDay(new Date()).replaceAll('-', '')}.csv`;
  return new Response(response.body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store, private',
      'x-content-type-options': 'nosniff',
    },
  });
}

function plain(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
