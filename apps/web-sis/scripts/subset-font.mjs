#!/usr/bin/env node
/**
 * B2: genera el subconjunto de Montserrat que usa la landing.
 *
 * - Fuente original (variable, OFL): assets/fonts/Montserrat-Variable.ttf
 * - Salida: src/app/fonts/Montserrat-latin.woff2 (la que carga next/font/local)
 *
 * Conserva latín básico, latín-1 (tildes, ñ, ¿, ¡, º, ×) y la puntuación
 * tipográfica española (comillas, rayas, puntos suspensivos). Recorta el eje
 * de peso al rango usado por el diseño (300–800).
 *
 * Uso: pnpm --filter @capsur/web-sis font:subset
 */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'assets/fonts/Montserrat-Variable.ttf');
const TARGET = resolve(root, 'src/app/fonts/Montserrat-latin.woff2');

/** Rangos Unicode incluidos (inclusive). */
const RANGES = [
  [0x0020, 0x007e], // latín básico
  [0x00a0, 0x00ff], // latín-1 (á é í ó ú ñ ü ¿ ¡ º ª × « »)
  [0x2010, 0x2014], // guiones, raya y semirraya
  [0x2018, 0x201e], // comillas simples y dobles tipográficas
  [0x2022, 0x2022], // viñeta
  [0x2026, 0x2026], // puntos suspensivos
  [0x2039, 0x203a], // comillas angulares simples
  [0x20ac, 0x20ac], // euro (precios de referencia)
];

function buildText() {
  let text = '';
  for (const [from, to] of RANGES) {
    for (let cp = from; cp <= to; cp += 1) text += String.fromCodePoint(cp);
  }
  return text;
}

const source = await readFile(SOURCE);
const output = await subsetFont(source, buildText(), {
  targetFormat: 'woff2',
  variationAxes: { wght: { min: 300, max: 800 } },
});
await writeFile(TARGET, output);

const before = (await stat(SOURCE)).size;
const after = output.length;
console.log(
  `Montserrat: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB (${TARGET.replace(root, '.')})`,
);
