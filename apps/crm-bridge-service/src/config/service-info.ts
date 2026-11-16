import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const SERVICE_NAME = 'crm-bridge-service';

const PackageSchema = z.object({ version: z.string() });

/** Versión leída del package.json del servicio (funciona desde src/ y desde dist/). */
export function readServiceVersion(): string {
  try {
    const raw = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
    return PackageSchema.parse(JSON.parse(raw)).version;
  } catch {
    return process.env.npm_package_version ?? '0.0.0';
  }
}
