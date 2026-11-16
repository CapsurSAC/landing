/** Entorno que se está validando (variables como texto). */
export type EnvSource = Readonly<Record<string, string | undefined>>;

let current: EnvSource | null = null;

/**
 * Ejecuta `fn` con `env` como entorno de validación. Zod valida de forma
 * síncrona, así que los fragmentos que dependen de `NODE_ENV` (p. ej. la
 * longitud mínima de tokens en producción) leen el entorno que se valida y
 * no `process.env`.
 */
export function withEnvContext<T>(env: EnvSource, fn: () => T): T {
  const previous = current;
  current = env;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

/** `true` si el entorno que se valida (o `process.env`) es de producción. */
export function isProductionContext(): boolean {
  return (current ?? process.env).NODE_ENV?.trim() === 'production';
}
