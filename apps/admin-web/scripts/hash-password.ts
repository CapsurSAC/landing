/**
 * Genera el hash bcrypt de una contraseña para ADMIN_USERS_JSON.
 *
 *   pnpm --filter @capsur/admin-web hash-password "<clave>"
 *   echo "<clave>" | pnpm --filter @capsur/admin-web hash-password      (evita dejarla en el historial)
 *
 * Imprime solo el hash. La contraseña nunca se guarda ni se registra.
 */
import { BCRYPT_COST, hashPassword } from '../src/lib/users';

const MIN_LENGTH = 12;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  let password = process.argv.slice(2).join(' ');
  if (!password && !process.stdin.isTTY) password = await readStdin();
  if (!password) {
    console.error('Uso: pnpm --filter @capsur/admin-web hash-password "<clave>"');
    process.exit(1);
  }
  if (password.length < MIN_LENGTH) {
    console.error(`La clave debe tener al menos ${MIN_LENGTH} caracteres.`);
    process.exit(1);
  }
  console.log(await hashPassword(password, BCRYPT_COST));
}

void main();
