#!/usr/bin/env node
/**
 * B3/B24: verifica que el bundle del navegador (.next/static/chunks) no
 * contiene Zod y que el JavaScript inicial no supera el umbral de alerta.
 * Funciona tanto con el build de Turbopack como con el de webpack.
 *
 * Uso (tras `next build`): pnpm --filter @capsur/web-sis check:bundle
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chunksDir = join(root, '.next', 'static', 'chunks');
/** Umbral de alerta del JS total del navegador comprimido (gzip). */
const TOTAL_GZIP_ALERT_KB = Number(process.env.BUNDLE_ALERT_KB ?? 350);

/**
 * Firmas que solo aparecen si el runtime de Zod 4 está en el chunk. No se usa
 * «ZodError»: la integración ZodErrors de Sentry contiene ese texto sin incluir
 * Zod (y su chunk solo se descarga si hay DSN).
 */
const ZOD_SIGNATURES = ['$ZodType', '$ZodObject', '_zod.def'];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

try {
  await stat(chunksDir);
} catch {
  console.error('No existe .next/static/chunks: ejecuta antes `pnpm --filter @capsur/web-sis build`.');
  process.exit(1);
}

const offenders = [];
let totalGzip = 0;
let files = 0;
for await (const file of walk(chunksDir)) {
  const source = await readFile(file, 'utf8');
  files += 1;
  totalGzip += gzipSync(source).length;
  const hits = ZOD_SIGNATURES.filter((sig) => source.includes(sig));
  if (hits.length > 0) offenders.push({ file: file.replace(root, '.'), hits });
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Chunks del navegador: ${files} archivos, ${kb(totalGzip)} gzip en total.`);
if (offenders.length > 0) {
  console.error('Zod aparece en el bundle del navegador:');
  for (const o of offenders) console.error(`  ${o.file}: ${o.hits.join(', ')}`);
  process.exit(1);
}
console.log('OK: zod no está en ningún chunk del navegador.');
if (totalGzip / 1024 > TOTAL_GZIP_ALERT_KB) {
  console.warn(`AVISO: el JS del navegador supera ${TOTAL_GZIP_ALERT_KB} KB gzip.`);
}
