import { loadEnv } from '@capsur/config';
import { type Env, envDefinition } from './env.definition';

export type { Env } from './env.definition';

/**
 * Función `validate` para `ConfigModule.forRoot`. Lanza un error legible que
 * lista cada variable inválida (sin mostrar sus valores).
 */
export function validateEnv(config: Record<string, unknown>): Env {
  return loadEnv(envDefinition, config as NodeJS.ProcessEnv);
}
