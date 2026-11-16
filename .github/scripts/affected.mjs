#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Calcula qué apps están afectadas por el PR (B16) con `turbo ls --affected`
// y lo publica como salidas del job (GITHUB_OUTPUT):
//   web_sis   true/false
//   services  JSON con los servicios Nest afectados
//   apps      JSON con todas las apps con imagen Docker afectadas
// En push a main (o si turbo falla) se consideran afectadas todas.
// ---------------------------------------------------------------------------
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const SERVICES = ['promotions-service', 'leads-service', 'crm-bridge-service'];
const APPS = ['web-sis', 'admin-web', ...SERVICES];

let affected = new Set(APPS);
if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
  try {
    const raw = execSync('npx --yes turbo@2.11.11 ls --affected --output=json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
    });
    const json = JSON.parse(raw.slice(raw.indexOf('{')));
    const names = (json.packages?.items ?? []).map((p) => String(p.name).replace(/^@capsur\//, ''));
    affected = new Set(names.filter((n) => APPS.includes(n)));
    console.log(`Paquetes afectados: ${names.join(', ') || '(ninguno)'}`);
  } catch (error) {
    console.log(
      `No se pudo calcular el conjunto afectado (${error.message}); se usan todas las apps.`,
    );
  }
}

const out = {
  web_sis: String(affected.has('web-sis')),
  services: JSON.stringify(SERVICES.filter((s) => affected.has(s))),
  apps: JSON.stringify(APPS.filter((a) => affected.has(a))),
};
console.log(out);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(out)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
  );
}
