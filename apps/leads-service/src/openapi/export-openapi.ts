/**
 * Exporta el documento OpenAPI de leads-service a
 * `docs/api/openapi/leads-service.json` (B14) SIN base de datos ni broker:
 * la app se crea en modo `preview` de Nest (resuelve el grafo de módulos y
 * los metadatos de los controladores, pero no instancia proveedores ni abre
 * conexiones) con el entorno de ejemplo de `env.definition.ts`.
 *
 *   pnpm --filter @capsur/leads-service openapi:export
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';
import { envDefinition } from '../config/env.definition';
import { buildOpenApiDocument } from '../presentation/http/openapi';

const PACKAGE_ROOT = resolve(__dirname, '..', '..');
export const OPENAPI_OUTPUT = resolve(PACKAGE_ROOT, '..', '..', 'docs', 'api', 'openapi', 'leads-service.json');

async function main(): Promise<void> {
  const env = envDefinition.parse({ ...envDefinition.examples, NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env, { workers: false }), {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  const document = buildOpenApiDocument(app);
  mkdirSync(dirname(OPENAPI_OUTPUT), { recursive: true });
  writeFileSync(OPENAPI_OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  const operations = Object.values(document.paths).reduce((total, item) => total + Object.keys(item).length, 0);
  process.stdout.write(
    `OpenAPI exportado: ${relative(process.cwd(), OPENAPI_OUTPUT)} (${Object.keys(document.paths).length} rutas, ${operations} operaciones)\n`,
  );
  // Sin app.close(): en modo preview los proveedores no se instanciaron y no hay conexiones abiertas.
}

main().catch((error: unknown) => {
  process.stderr.write(`No se pudo exportar OpenAPI: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
