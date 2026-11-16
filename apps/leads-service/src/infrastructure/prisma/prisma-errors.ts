import { Prisma } from '../../../prisma/generated/client';

/** `true` si el error es una violación de clave única (P2002) sobre alguna de las columnas dadas. */
export function isUniqueViolation(error: unknown, columns?: readonly string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  if (!columns) {
    return true;
  }
  const target = error.meta?.target;
  const targets = Array.isArray(target)
    ? target.map(String)
    : typeof target === 'string'
      ? [target]
      : [];
  return targets.some((t) => columns.some((column) => t.includes(column)));
}
