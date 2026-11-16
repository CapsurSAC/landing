import { type PiiCipher } from '@capsur/nest-kit';
import { type PrismaClient } from '../../../prisma/generated/client';

interface LegacyRow {
  lead_id: string;
  payload: unknown;
}

/**
 * C8: cifra los `sync_jobs.payload` heredados (JSON en claro) en `payload_encrypted` y vacía
 * la columna antigua. Se ejecuta tras `prisma migrate deploy` (script `db:migrate`) y al
 * arrancar el servicio (en contenedores el job de migraciones no tiene la clave). Idempotente
 * y seguro con varias réplicas (`FOR UPDATE SKIP LOCKED`). Devuelve las filas convertidas.
 */
export async function encryptLegacyPayloads(prisma: PrismaClient, cipher: PiiCipher, batchSize = 100): Promise<number> {
  let total = 0;
  for (;;) {
    const converted = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LegacyRow[]>`
        SELECT lead_id, payload
          FROM sync_jobs
         WHERE payload IS NOT NULL
         ORDER BY lead_id
         LIMIT ${batchSize}
           FOR UPDATE SKIP LOCKED`;
      for (const row of rows) {
        const encrypted = cipher.encryptJson(row.payload);
        await tx.$executeRaw`
          UPDATE sync_jobs
             SET payload_encrypted = COALESCE(payload_encrypted, ${encrypted}),
                 payload = NULL
           WHERE lead_id = ${row.lead_id}`;
      }
      return rows.length;
    });
    total += converted;
    if (converted < batchSize) {
      return total;
    }
  }
}
