#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Aplica infrastructure/rabbitmq/definitions.json en un broker EN CALIENTE
// mediante la API de gestión (POST /api/definitions), sin reiniciar nada.
//
// En PRODUCCIÓN las contraseñas NO salen del archivo: para cada usuario no
// administrador se exige RABBITMQ_PASSWORD_<USUARIO EN MAYÚSCULAS>
// (p. ej. RABBITMQ_PASSWORD_LEADS_SVC). El usuario administrador del archivo
// (`capsur`, solo desarrollo) se omite; en producción el administrador es
// RABBITMQ_DEFAULT_USER del contenedor.
//
// Variables:
//   RABBITMQ_MGMT_URL        http://rabbitmq:15672 (por defecto http://localhost:15672)
//   RABBITMQ_ADMIN_USER/PASS credenciales de administración
//   RABBITMQ_DEFINITIONS     ruta del JSON (por defecto ./definitions.json junto al script)
//   RABBITMQ_KEEP_FILE_USERS=true  usa los usuarios y contraseñas del archivo (solo local)
//
// Uso local:   RABBITMQ_ADMIN_USER=capsur RABBITMQ_ADMIN_PASS=capsur RABBITMQ_KEEP_FILE_USERS=true \
//                node infrastructure/rabbitmq/apply-definitions.mjs
// ---------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.env.RABBITMQ_DEFINITIONS ?? join(here, 'definitions.json');
const base = (process.env.RABBITMQ_MGMT_URL ?? 'http://localhost:15672').replace(/\/$/, '');
const adminUser = process.env.RABBITMQ_ADMIN_USER;
const adminPass = process.env.RABBITMQ_ADMIN_PASS;
const keepFileUsers = process.env.RABBITMQ_KEEP_FILE_USERS === 'true';

if (!adminUser || !adminPass) {
  console.error('Faltan RABBITMQ_ADMIN_USER / RABBITMQ_ADMIN_PASS');
  process.exit(2);
}

const defs = JSON.parse(await readFile(file, 'utf8'));

if (!keepFileUsers) {
  const missing = [];
  const users = [];
  for (const u of defs.users ?? []) {
    if ((u.tags ?? []).includes('administrator')) continue;
    const envName = `RABBITMQ_PASSWORD_${u.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    const password = process.env[envName];
    if (!password) missing.push(envName);
    users.push({ name: u.name, password, tags: u.tags ?? [] });
  }
  if (missing.length > 0) {
    console.error(`Faltan contraseñas: ${missing.join(', ')}`);
    process.exit(2);
  }
  const names = new Set(users.map((u) => u.name));
  defs.users = users;
  defs.permissions = (defs.permissions ?? []).filter((p) => names.has(p.user));
}

const auth = 'Basic ' + Buffer.from(`${adminUser}:${adminPass}`).toString('base64');
const headers = { authorization: auth, 'content-type': 'application/json' };

const res = await fetch(`${base}/api/definitions`, {
  method: 'POST',
  headers,
  body: JSON.stringify(defs),
});
if (!res.ok) {
  console.error(`POST /api/definitions -> ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`POST /api/definitions -> ${res.status}`);

const queues = await (await fetch(`${base}/api/queues`, { headers })).json();
const expected = (defs.queues ?? []).map((q) => q.name);
const present = new Set(queues.map((q) => q.name));
for (const name of expected) console.log(`${present.has(name) ? 'OK   ' : 'FALTA'} cola ${name}`);
const brokerUsers = await (await fetch(`${base}/api/users`, { headers })).json();
console.log(`usuarios: ${brokerUsers.map((u) => u.name).join(', ')}`);
if (expected.some((n) => !present.has(n))) process.exit(1);
