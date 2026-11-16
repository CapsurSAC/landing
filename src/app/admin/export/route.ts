import { currentAdmin } from '@/server/auth';
import { listLeads } from '@/server/db';
import { csvCell, dialCode, filtersFrom, formatLimaDateTime, leadOrigin } from '../leads-view';

export const dynamic = 'force-dynamic';

/** GET /admin/export: los leads filtrados en CSV (UTF-8 con BOM para Excel). */
export async function GET(request: Request): Promise<Response> {
  if (!(await currentAdmin())) return new Response('No autorizado', { status: 401 });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const rows = listLeads(filtersFrom(params), 100_000);
  const header = ['Fecha', 'Hora', 'Nombre', 'Correo', 'Celular', 'Carrera', 'Promoción', 'Sede', 'Origen', 'WhatsApp', 'Estado'];
  const lines = rows.map((r) => {
    const { date, time } = formatLimaDateTime(r.createdAt);
    return [
      date,
      time,
      r.fullName,
      r.email,
      // Sin «+»: Excel lo tomaría como fórmula y csvCell le antepondría un apóstrofo.
      r.phone ? `${dialCode(r.phoneCountry).replace('+', '')} ${r.phone}` : '',
      r.specialties.join(' / ') || 'Lo decide con un asesor',
      r.promotionName,
      r.campus,
      leadOrigin(r),
      r.whatsappSentAt ? 'Lo abrió' : 'A medias',
      r.status,
    ]
      .map(csvCell)
      .join(',');
  });
  const csv = `\uFEFF${[header.map(csvCell).join(','), ...lines].join('\r\n')}`;
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="leads-sis-${day}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
