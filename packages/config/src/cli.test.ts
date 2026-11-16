import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { runCli, type CliIo } from './cli';

function fakeIo(): CliIo & { out: string[]; err: string[]; files: Map<string, string> } {
  const out: string[] = [];
  const err: string[] = [];
  const files = new Map<string, string>();
  return {
    cwd: resolve(__dirname, '..'),
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    writeFile: (path, content) => files.set(path, content),
    out,
    err,
    files,
  };
}

describe('capsur-env-example', () => {
  it('escribe .env.example con comentarios por variable', async () => {
    const io = fakeIo();
    const code = await runCli(['src/__fixtures__/env.fixture.ts', 'envDefinition'], io);
    assert.equal(code, 0, io.err.join(''));
    const content = io.files.get(resolve(io.cwd, '.env.example'));
    assert.ok(content);
    assert.equal(
      content,
      [
        '# leads-service',
        '# Generado por capsur-env-example desde src/__fixtures__/env.fixture.ts#envDefinition. No editar a mano:',
        '# cambia los ejemplos en el esquema del servicio y vuelve a generarlo.',
        '',
        'NODE_ENV=development',
        '',
        '# Puerto HTTP del servicio',
        'PORT=3002',
        '',
        'DATABASE_URL=postgresql://leads:leads@localhost:5432/leads',
        '',
        '# Tokens de los llamadores internos: JSON {"<llamador>":"<token>"}',
        'INTERNAL_API_TOKENS={"admin-web":"dev-admin-to-leads"}',
        '',
        'SWAGGER_ENABLED=false',
        '',
        "GREETING='hola mundo # con almohadilla'",
        '',
      ].join('\n'),
    );
    assert.match(io.out.join(''), /Escrito \.env\.example \(6 variables\)/);
  });

  it('--stdout y --out', async () => {
    const io = fakeIo();
    assert.equal(await runCli(['src/__fixtures__/env.fixture.ts', 'envDefinition', '--stdout'], io), 0);
    assert.match(io.out.join(''), /PORT=3002/);
    assert.equal(io.files.size, 0);

    const io2 = fakeIo();
    assert.equal(await runCli(['src/__fixtures__/env.fixture.ts', 'envDefinition', '--out', 'tmp/.env.sample'], io2), 0);
    assert.ok(io2.files.has(resolve(io2.cwd, 'tmp/.env.sample')));
  });

  it('errores claros: uso, módulo inexistente y export que no es defineEnv', async () => {
    const usage = fakeIo();
    assert.equal(await runCli([], usage), 2);
    assert.match(usage.err.join(''), /Uso: capsur-env-example/);

    const missing = fakeIo();
    assert.equal(await runCli(['no/existe.js', 'x'], missing), 1);
    assert.match(missing.err.join(''), /No se pudo cargar no\/existe\.js/);

    const wrong = fakeIo();
    assert.equal(await runCli(['src/__fixtures__/env.fixture.ts', 'notADefinition'], wrong), 1);
    assert.match(wrong.err.join(''), /no es una definición creada con defineEnv/);
  });
});
