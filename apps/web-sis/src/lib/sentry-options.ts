/**
 * Opciones comunes de Sentry (C23). En @sentry/nextjs 11 `sendDefaultPii`
 * se sustituyó por `dataCollection`: se desactiva todo lo que puede contener
 * datos personales (usuario/IP, cookies, cabeceras, cuerpos, query, variables).
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  genAI: { inputs: false, outputs: false },
} as const;
