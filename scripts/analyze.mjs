#!/usr/bin/env node
/**
 * B24: build con @next/bundle-analyzer (webpack) y comprobación de que Zod
 * no llega al navegador. Multiplataforma (no depende de la sintaxis VAR=x).
 *
 * Informes: .next/analyze/{client,nodejs,edge}.html
 * Uso: pnpm --filter @capsur/web-sis analyze
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, ANALYZE: 'true' };

const build = spawnSync('pnpm', ['exec', 'next', 'build', '--webpack'], { cwd: root, env, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log('\nInformes del analizador en .next/analyze/ (client.html = bundle del navegador).');
const check = spawnSync('node', ['scripts/check-client-bundle.mjs'], { cwd: root, stdio: 'inherit', shell: true });
process.exit(check.status ?? 1);
