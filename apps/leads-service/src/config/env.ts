import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv, type EnvSource } from '@capsur/config';
import { envDefinition, type Env } from './env.definition';

export { envDefinition, type Env };

/** Token de inyección de la configuración tipada. El servicio nunca lee `process.env` fuera de aquí. */
export const ENV = Symbol('ENV');

/**
 * Carga `.env` (si existe, sin sobrescribir variables ya definidas) con el
 * cargador nativo de Node y valida el entorno. Lanza `EnvValidationError`
 * con la lista de variables inválidas (sin valores).
 */
export function loadServiceEnv(source: EnvSource = process.env, dotenvPath = resolve(process.cwd(), '.env')): Env {
  if (source === process.env && existsSync(dotenvPath)) {
    process.loadEnvFile(dotenvPath);
  }
  return loadEnv(envDefinition, source);
}
