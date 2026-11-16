import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface PackageInfo {
  name: string;
  version: string;
}

/** Lee `package.json` en tiempo de ejecución (funciona desde `src/` y desde `dist/`). */
function readPackageInfo(): PackageInfo {
  try {
    const raw = readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PackageInfo>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '@capsur/leads-service',
      version: typeof parsed.version === 'string' ? parsed.version : '0.0.0',
    };
  } catch {
    return { name: '@capsur/leads-service', version: '0.0.0' };
  }
}

const info = readPackageInfo();

export const SERVICE_NAME = info.name.replace(/^@capsur\//, '');
export const SERVICE_VERSION = info.version;
