/**
 * Primera importación de `main.ts`: inicializa Sentry (C23) antes de cargar
 * Nest. `SENTRY_DSN` vacío = desactivado. Se carga `.env` aquí para que el
 * DSN esté disponible también en desarrollo.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { initSentry } from '@capsur/nest-kit/sentry';
import { SERVICE_NAME, SERVICE_VERSION } from './version';

const dotenv = resolve(process.cwd(), '.env');
if (existsSync(dotenv)) {
  process.loadEnvFile(dotenv);
}

initSentry({ service: SERVICE_NAME, release: SERVICE_VERSION });
