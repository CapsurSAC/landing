import 'server-only';

/**
 * Log estructurado mínimo (una línea JSON por evento), compatible con el
 * formato de los servicios. Nunca registrar nombres, teléfonos ni correos de
 * leads; el correo del usuario del panel (actor) sí, porque es auditoría.
 */
type Level = 'info' | 'warn' | 'error';

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), service: 'admin-web', msg, ...fields });
  if (level === 'info') process.stdout.write(`${line}\n`);
  else process.stderr.write(`${line}\n`);
}

export function audit(action: string, actor: string | null, fields: Record<string, unknown> = {}): void {
  log('info', action, { audit: true, action, actor, ...fields });
}
