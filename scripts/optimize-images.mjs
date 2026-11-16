#!/usr/bin/env node
/**
 * B1: convierte las imágenes fuente (assets/originals/*.png) a WebP (< 300 KB)
 * con sharp y la deja en public/. Calcula también AVIF como comparación.
 *
 * - Hero (con transparencia): WebP con alfa; AVIF con alfa.
 * - Campus (opaca): WebP y AVIF.
 *
 * next/image vuelve a optimizar al vuelo según el navegador; estas versiones
 * reducen el peso de la fuente, del repositorio y de la imagen Docker.
 *
 * Uso: pnpm --filter @capsur/web-sis images:optimize
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = 300 * 1024;

const JOBS = [
  { source: 'assets/originals/students.png', target: 'public/hero/students', alpha: true },
  { source: 'assets/originals/campus.png', target: 'public/about/campus', alpha: false },
];

for (const job of JOBS) {
  const input = resolve(root, job.source);
  const original = (await stat(input)).size;
  await mkdir(dirname(resolve(root, job.target)), { recursive: true });

  // WebP: calidad alta y alfa sin pérdidas visibles en los bordes del recorte.
  const webp = await sharp(input)
    .webp({ quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true })
    .toBuffer();
  // AVIF: misma calidad perceptual con menos bytes.
  const avif = await sharp(input).avif({ quality: 58, effort: 6, chromaSubsampling: '4:4:4' }).toBuffer();

  // Se publica la WebP: next/image la vuelve a codificar a AVIF/WebP según el
  // navegador, y partir de la fuente con menos pérdida evita doble degradación.
  // El tamaño AVIF se informa solo como referencia.
  await writeFile(resolve(root, `${job.target}.webp`), webp);

  const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;
  const status = (n) => (n < LIMIT ? 'ok' : 'SUPERA 300 KB');
  console.log(
    `${job.source}: ${fmt(original)} → webp ${fmt(webp.length)} (${status(webp.length)}), avif ${fmt(avif.length)} (${status(avif.length)})`,
  );
}
