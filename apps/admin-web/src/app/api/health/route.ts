/** Salud del propio panel para el orquestador (sin datos ni dependencias). */
export function GET() {
  return Response.json(
    { status: 'ok', service: 'admin-web', timestamp: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
