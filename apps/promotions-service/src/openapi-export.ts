/**
 * Exporta el contrato OpenAPI a `docs/api/openapi/promotions-service.json`
 * (B14) sin base de datos ni Redis: Nest en modo `preview` registra módulos y
 * rutas sin instanciar proveedores, suficiente para generar el documento.
 * CI compara el archivo con la rama base (`oasdiff breaking`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { buildOpenApiDocument } from './presentation/http/openapi';

// Valores ficticios solo para que la validación del entorno no falle.
process.env.NODE_ENV ??= 'development';
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
process.env.INTERNAL_API_TOKENS ??= '{"openapi":"openapi-export-token"}';
process.env.LOG_LEVEL = 'silent';

async function exportOpenApi(): Promise<void> {
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, { preview: true, logger: false, abortOnError: false });
  const document = buildOpenApiDocument(app);
  const target = path.resolve(__dirname, '../../../docs/api/openapi/promotions-service.json');
  mkdirSync(path.dirname(target), { recursive: true });
  // Orden estable de rutas para diffs legibles.
  const paths = Object.fromEntries(Object.entries(document.paths).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(target, `${JSON.stringify({ ...document, paths }, null, 2)}\n`);
  process.stdout.write(`OpenAPI escrito en ${path.relative(process.cwd(), target)} (${Object.keys(paths).length} rutas)\n`);
  await app.close();
}

exportOpenApi().catch((error: unknown) => {
  process.stderr.write(`No se pudo exportar OpenAPI: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
