import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { CATALOG_CACHE_TAG } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

/** Etiquetas que promotions-service puede invalidar. */
const ALLOWED_TAGS = new Set([CATALOG_CACHE_TAG]);

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Comparación en tiempo constante; si la longitud difiere se compara contra sí mismo para no filtrar tiempos.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function problem(status: number, title: string, code: string) {
  return Response.json({ type: 'about:blank', title, status, code }, { status, headers: { 'content-type': 'application/problem+json' } });
}

/**
 * POST /api/revalidate (B8, spec §4). Lo llama promotions-service tras cada
 * cambio de promociones o especialidades:
 *   cabecera `x-revalidate-secret: <REVALIDATE_SECRET>`, cuerpo `{"tags":["catalog"]}`.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? '';
  if (!secret) return problem(503, 'Revalidación no configurada', 'REVALIDATE_DISABLED');
  const provided = request.headers.get('x-revalidate-secret') ?? '';
  if (!safeEqual(provided, secret)) return problem(401, 'Secreto inválido', 'UNAUTHORIZED');

  let tags: string[] = [CATALOG_CACHE_TAG];
  try {
    const body = (await request.json()) as { tags?: unknown };
    if (Array.isArray(body.tags)) tags = body.tags.filter((t): t is string => typeof t === 'string');
  } catch {
    // cuerpo vacío o inválido: se revalida el catálogo
  }
  const accepted = tags.filter((t) => ALLOWED_TAGS.has(t));
  if (accepted.length === 0) return problem(400, 'Etiquetas no permitidas', 'INVALID_TAGS');

  // expire: 0 → la siguiente petición vuelve a pedir el catálogo (sin servir datos viejos).
  for (const tag of accepted) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: accepted, at: new Date().toISOString() });
}
