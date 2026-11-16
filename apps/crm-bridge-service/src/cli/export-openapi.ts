/**
 * `pnpm openapi:export`: escribe el OpenAPI del servicio en
 * `docs/api/openapi/crm-bridge-service.json` (B14). Solo usa los esquemas Zod: no necesita
 * variables de entorno, base de datos ni broker.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readServiceVersion } from '../config/service-info';
import { buildOpenApiDocument } from '../presentation/http/openapi';

const target = resolve(process.argv[2] ?? resolve(__dirname, '..', '..', '..', '..', 'docs', 'api', 'openapi', 'crm-bridge-service.json'));
const document = buildOpenApiDocument(readServiceVersion());
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
process.stdout.write(`OpenAPI escrito en ${target} (${Object.keys(document.paths).length} rutas)\n`);
