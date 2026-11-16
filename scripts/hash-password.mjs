/**
 * Genera el hash de la contraseña del panel para ADMIN_PASSWORD_HASH.
 * Uso: node scripts/hash-password.mjs "tu-contraseña"
 * Mismo formato que src/server/auth.ts (scrypt:<sal>:<hash>).
 */
import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Uso: node scripts/hash-password.mjs "contraseña de al menos 10 caracteres"');
  process.exit(1);
}
const salt = randomBytes(16).toString('hex');
console.log(`scrypt:${salt}:${scryptSync(password, salt, 32).toString('hex')}`);
console.log(`\nPara ADMIN_SESSION_SECRET puedes usar: ${randomBytes(32).toString('hex')}`);
