import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Carga `.env` del directorio del servicio si existe (desarrollo). En contenedores las
 * variables llegan por el entorno y el archivo no existe. `process.loadEnvFile` nunca
 * sobrescribe variables ya definidas.
 */
export function loadDotEnvFile(directory = process.cwd()): void {
  const file = join(directory, '.env');
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}
