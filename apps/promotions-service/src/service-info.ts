import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SERVICE_NAME = 'promotions-service';

/** Lee la versión del package.json del servicio sin incluirlo en la compilación. */
function readVersion(): string {
  const fromEnv = process.env.SERVICE_VERSION;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  try {
    const raw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
      const version = (parsed as { version?: unknown }).version;
      if (typeof version === 'string') {
        return version;
      }
    }
  } catch {
    // Sin package.json accesible (por ejemplo en pruebas aisladas): se usa el valor por defecto.
  }
  return '0.0.0';
}

export const SERVICE_VERSION = readVersion();
