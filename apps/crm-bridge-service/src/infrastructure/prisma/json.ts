import { type Prisma } from '../../../prisma/generated/client';

/** Convierte cualquier valor serializable en JSON de entrada para Prisma (sin `any`). */
export function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
