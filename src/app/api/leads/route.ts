import { z } from 'zod';
import { getPromotions, getSpecialties } from '@/lib/catalog';
import { upsertLead } from '@/server/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads: guarda el formulario de catálogo para el panel, también a
 * medias (mientras la persona escribe). Cada navegador manda su `clientKey`,
 * así que las sucesivas llamadas actualizan el mismo lead. `whatsappSent`
 * marca que pulsó el botón; en ese caso se exige el formulario completo.
 */

const text = (max: number) => z.string().trim().max(max);

const LeadBody = z.object({
  clientKey: z.uuid(),
  whatsappSent: z.boolean().default(false),
  fullName: text(120).default(''),
  phoneCountry: z.string().regex(/^[A-Z]{2}$/).default('PE'),
  phone: z.string().regex(/^\d{0,15}$/).default(''),
  email: text(160).toLowerCase().default(''),
  campus: z.enum(['tacna', 'arequipa']).default('tacna'),
  promotionId: text(80).default(''),
  specialtyIds: z.array(text(80)).max(3).default([]),
  attribution: z
    .object({
      utmSource: text(100),
      utmMedium: text(100),
      utmCampaign: text(150),
      referrer: text(500),
    })
    .partial()
    .default({}),
});

type Body = z.infer<typeof LeadBody>;

/** Algo con lo que un asesor pueda contactar o reconocer a la persona. */
function hasContactData(b: Body): boolean {
  return b.fullName.length >= 3 || b.phone.length >= 6 || b.email.includes('@');
}

function isComplete(b: Body): boolean {
  return b.fullName.length >= 3 && b.phone.length >= 6 && z.email().safeParse(b.email).success && b.promotionId !== '';
}

/* shortcut: límite por IP en memoria (se reinicia con el servidor); detrás de varios servidores haría falta uno compartido. */
const WINDOW_MS = 10 * 60 * 1000;
// Holgado: el formulario guarda el borrador varias veces mientras se escribe.
const MAX_PER_WINDOW = 60;
const hits = new Map<string, number[]>();

function rateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request): Promise<Response> {
  // Solo desde la propia web: el navegador siempre envía Origin en un POST con fetch.
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) return new Response(null, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 8_000) return new Response(null, { status: 413 });

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) return new Response(null, { status: 429 });

  let body: Body;
  try {
    body = LeadBody.parse(await request.json());
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!hasContactData(body)) return new Response(null, { status: 204 });
  if (body.whatsappSent && !isComplete(body)) return new Response(null, { status: 400 });

  // Los nombres salen del catálogo del servidor, no de lo que mande el navegador.
  const [{ items: promotions }, { items: specialties }] = await Promise.all([getPromotions(), getSpecialties()]);
  const promotion = body.promotionId ? promotions.find((p) => p.id === body.promotionId) : undefined;
  if (body.promotionId && !promotion) return new Response(null, { status: 400 });
  const specialtyNames = body.specialtyIds.map((id) => specialties.find((s) => s.id === id)?.name);
  if (specialtyNames.some((n) => !n)) return new Response(null, { status: 400 });

  upsertLead(
    body.clientKey,
    {
      fullName: body.fullName,
      phoneCountry: body.phoneCountry,
      phone: body.phone,
      email: body.email,
      campus: body.campus,
      promotionId: promotion?.id ?? '',
      promotionName: promotion?.name ?? '',
      specialties: specialtyNames as string[],
      utmSource: body.attribution.utmSource ?? '',
      utmMedium: body.attribution.utmMedium ?? '',
      utmCampaign: body.attribution.utmCampaign ?? '',
      referrer: body.attribution.referrer ?? '',
    },
    body.whatsappSent,
  );
  return new Response(null, { status: 201 });
}
