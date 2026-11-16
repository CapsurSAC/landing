/**
 * Punto de enganche entre el filtro de errores y Sentry sin importar Sentry
 * aquí: `initSentry` instala el reportero; si Sentry está desactivado, no hace
 * nada. Así el filtro no arrastra la carga de `@sentry/nestjs`.
 */
export type ErrorReporter = (error: unknown, context: Readonly<Record<string, string | number | undefined>>) => void;

let reporter: ErrorReporter | null = null;

/** Instala (o quita con `null`) el reportero de errores 5xx. */
export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next;
}

/** Reporta un error de servidor si hay reportero instalado; nunca lanza. */
export function reportServerError(error: unknown, context: Readonly<Record<string, string | number | undefined>>): void {
  if (!reporter) {
    return;
  }
  try {
    reporter(error, context);
  } catch {
    // Un fallo del reportero nunca debe romper la respuesta HTTP.
  }
}
