/**
 * lint-staged (B26): Prettier en todo lo formateable y ESLint solo en el
 * paquete afectado, con su propia configuración (eslint.config.mjs del
 * paquete). Se ejecuta desde .husky/pre-commit.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
// Barras normales: funcionan en Windows y evitan escapes al parsear el comando.
const toPosix = (p) => p.split(path.sep).join('/');
const quote = (files) => files.map((f) => `"${toPosix(f)}"`).join(' ');

/** Agrupa archivos por paquete (apps/<x> o packages/<x>). */
function byPackage(files) {
  const groups = new Map();
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep);
    if ((rel[0] !== 'apps' && rel[0] !== 'packages') || rel.length < 3) continue;
    const dir = `${rel[0]}/${rel[1]}`;
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }
  return groups;
}

export default {
  // Los YAML de Traefik usan plantillas Go ({{ ... }}): no son YAML válido hasta renderizarse.
  '*.{ts,tsx,js,mjs,cjs,json,md,yml,yaml,css}': (files) => {
    const formattable = files.filter((f) => !toPosix(f).includes('infrastructure/docker/traefik/'));
    return formattable.length > 0 ? `prettier --write --ignore-unknown ${quote(formattable)}` : [];
  },
  '{apps,packages}/**/*.{ts,tsx,js,mjs,cjs}': (files) => {
    const commands = [];
    for (const [dir, pkgFiles] of byPackage(files)) {
      const hasConfig = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs'].some((c) =>
        existsSync(path.join(root, dir, c)),
      );
      if (!hasConfig) continue;
      commands.push(
        `pnpm --dir ${dir} exec eslint --fix --max-warnings=0 --no-warn-ignored ${quote(pkgFiles)}`,
      );
    }
    return commands;
  },
};
