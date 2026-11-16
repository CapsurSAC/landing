#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isEnvDefinition } from './define-env';
import { renderEnvExample } from './env-example';

/** Entrada/salida del CLI (inyectable en pruebas). */
export interface CliIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  writeFile: (path: string, content: string) => void;
}

const USAGE = [
  'Uso: capsur-env-example <ruta-al-módulo-compilado> <export> [--out <archivo>] [--stdout]',
  '',
  '  <ruta-al-módulo-compilado>  p. ej. dist/config/env.js',
  '  <export>                    nombre del export creado con defineEnv (p. ej. envDefinition)',
  '  --out <archivo>             destino (por defecto .env.example en el directorio actual)',
  '  --stdout                    imprime en la salida estándar en lugar de escribir el archivo',
].join('\n');

async function loadModule(path: string): Promise<Record<string, unknown>> {
  try {
    // require síncrono: carga CommonJS (y ESM sin top-level await en Node ≥ 22).
    return createRequire(path)(path) as Record<string, unknown>;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 'ERR_REQUIRE_ESM' && code !== 'ERR_REQUIRE_ASYNC_MODULE') {
      throw error;
    }
    return (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  }
}

/** Ejecuta el CLI y devuelve el código de salida. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const positional: string[] = [];
  let out = '.env.example';
  let toStdout = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--out') {
      out = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--stdout') {
      toStdout = true;
    } else if (arg === '-h' || arg === '--help') {
      io.stdout(`${USAGE}\n`);
      return 0;
    } else {
      positional.push(arg);
    }
  }
  const [modulePath, exportName] = positional;
  if (!modulePath || !exportName || out === '') {
    io.stderr(`${USAGE}\n`);
    return 2;
  }

  const absolute = resolve(io.cwd, modulePath);
  let loaded: Record<string, unknown>;
  try {
    loaded = await loadModule(absolute);
  } catch (error) {
    io.stderr(`No se pudo cargar ${modulePath}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const fallback = loaded.default as Record<string, unknown> | undefined;
  const definition = loaded[exportName] ?? fallback?.[exportName];
  if (!isEnvDefinition(definition)) {
    io.stderr(`El export "${exportName}" de ${modulePath} no es una definición creada con defineEnv\n`);
    return 1;
  }

  const content = renderEnvExample(definition, `${relative(io.cwd, absolute).replace(/\\/g, '/')}#${exportName}`);
  if (toStdout) {
    io.stdout(content);
    return 0;
  }
  const target = resolve(io.cwd, out);
  io.writeFile(target, content);
  io.stdout(`Escrito ${relative(io.cwd, target) || target} (${Object.keys(definition.shape).length} variables)\n`);
  return 0;
}

if (require.main === module) {
  runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    writeFile: (path, content) => writeFileSync(path, content, 'utf8'),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
