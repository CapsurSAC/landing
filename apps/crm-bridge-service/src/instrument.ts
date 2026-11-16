/**
 * Primera importación de `main.ts`: carga `.env` (desarrollo) e inicia Sentry (C23) antes
 * de cargar Nest. Solo importa `@capsur/nest-kit/sentry`, que no depende de Nest.
 */
import { initSentry } from '@capsur/nest-kit/sentry';
import { loadDotEnvFile } from './config/dotenv';
import { readServiceVersion, SERVICE_NAME } from './config/service-info';

loadDotEnvFile();
initSentry({ service: SERVICE_NAME, release: readServiceVersion() });
