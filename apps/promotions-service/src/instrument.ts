/**
 * Primera importación de `main.ts`: Sentry debe iniciarse antes de crear la
 * aplicación para instrumentar HTTP y Express (C23). `SENTRY_DSN` vacío =
 * desactivado. La limpieza de datos personales la hace el kit.
 */
import { initSentry } from '@capsur/nest-kit/sentry';
import { SERVICE_NAME, SERVICE_VERSION } from './service-info';

initSentry({ service: SERVICE_NAME, release: SERVICE_VERSION });
