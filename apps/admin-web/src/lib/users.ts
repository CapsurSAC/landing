import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ROLES } from './roles';
import type { SessionUser } from './session';

/**
 * Usuarios del panel definidos en ADMIN_USERS_JSON:
 *   [{ "email": "...", "name": "...", "role": "admin" | "asesor", "passwordHash": "$2b$12$..." }]
 * El hash se genera con `pnpm --filter @capsur/admin-web hash-password <clave>`.
 */

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export const AdminUserSchema = z.object({
  email: z.email().max(160).transform((v) => v.toLowerCase()),
  name: z.string().trim().min(1).max(80),
  role: z.enum(ROLES),
  passwordHash: z
    .string()
    .regex(
      BCRYPT_HASH,
      'passwordHash debe ser un hash bcrypt ($2b$…). Si viene de un .env, escribe cada "$" como "\\$": Next.js expande las variables',
    ),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUsersSchema = z
  .array(AdminUserSchema)
  .refine((users) => new Set(users.map((u) => u.email)).size === users.length, 'Hay correos repetidos');

export class AdminUsersConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminUsersConfigError';
  }
}

export function parseAdminUsers(json: string | undefined): AdminUser[] {
  if (!json || !json.trim()) {
    throw new AdminUsersConfigError('ADMIN_USERS_JSON no está definido: no hay usuarios que puedan iniciar sesión.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new AdminUsersConfigError('ADMIN_USERS_JSON no es JSON válido.');
  }
  const parsed = AdminUsersSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');
    throw new AdminUsersConfigError(`ADMIN_USERS_JSON inválido: ${detail}`);
  }
  return parsed.data;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findUser(users: readonly AdminUser[], email: string): AdminUser | undefined {
  const normalized = normalizeEmail(email);
  return users.find((u) => u.email === normalized);
}

let dummyHash: string | null = null;
function getDummyHash(): string {
  // Hash de una clave aleatoria: se compara cuando el correo no existe para
  // que el tiempo de respuesta no revele qué cuentas existen.
  dummyHash ??= bcrypt.hashSync(crypto.randomUUID(), 12);
  return dummyHash;
}

/** Comprueba credenciales en tiempo similar exista o no el usuario. */
export async function verifyCredentials(
  users: readonly AdminUser[],
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const user = findUser(users, email);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
  if (!user || !ok) return null;
  return { email: user.email, name: user.name, role: user.role };
}

export const BCRYPT_COST = 12;

export function hashPassword(password: string, cost: number = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(password, cost);
}
