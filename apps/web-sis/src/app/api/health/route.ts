export const dynamic = 'force-dynamic';

/** Health check de la app web para el orquestador. No consulta servicios externos. */
export function GET() {
  return Response.json({
    status: 'ok',
    service: 'web-sis',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
  });
}
