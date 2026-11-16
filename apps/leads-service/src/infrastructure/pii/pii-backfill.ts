import { Prisma, type PrismaClient } from '../../../prisma/generated/client';
import type { PiiCodec } from './pii-codec';

/** Expresión SQL del formato de PiiCipher (`v1.<iv>.<tag>.<ct>` en base64url). */
const SEALED_PATTERN = '^v1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*$';

export interface PiiBackfillSummary {
  leads: number;
  submissions: number;
  outboxEvents: number;
}

export type BackfillLogger = (message: string, context: Record<string, unknown>) => void;

interface LegacyLeadRow {
  id: string;
  full_name: string;
  phone_e164: string;
  email: string;
  anonymized_at: Date | null;
}

interface LegacyTextRow {
  id: string;
  value: string;
}

function isSealed(value: string): boolean {
  return new RegExp(SEALED_PATTERN).test(value);
}

/**
 * Cifra los datos personales guardados en claro antes de la migración
 * `20261113230000_pii_compliance` (C8) y calcula `phone_hash`/`email_hash`:
 * - `leads.full_name`, `phone_e164`, `email`;
 * - `lead_submissions.response_snapshot` (lleva el teléfono);
 * - `outbox_events.payload` (lleva nombre, teléfono y correo).
 *
 * Idempotente y seguro con varias réplicas a la vez: solo toca filas cuyo
 * valor aún no tiene el formato cifrado y cada UPDATE exige que el valor no
 * haya cambiado desde que se leyó (si otra réplica ganó, no hace nada).
 */
export async function backfillPii(
  prisma: PrismaClient,
  codec: PiiCodec,
  log: BackfillLogger = () => undefined,
  batchSize = 200,
): Promise<PiiBackfillSummary> {
  const summary: PiiBackfillSummary = { leads: 0, submissions: 0, outboxEvents: 0 };

  for (let guard = 0; guard < 10_000; guard += 1) {
    const rows = await prisma.$queryRaw<LegacyLeadRow[]>(Prisma.sql`
      SELECT id, full_name, phone_e164, email, anonymized_at
      FROM leads
      WHERE full_name !~ ${SEALED_PATTERN} OR phone_e164 !~ ${SEALED_PATTERN} OR email !~ ${SEALED_PATTERN}
      ORDER BY id
      LIMIT ${batchSize}
    `);
    if (rows.length === 0) {
      break;
    }
    for (const row of rows) {
      const active = row.anonymized_at === null;
      const phone = isSealed(row.phone_e164) ? codec.open(row.phone_e164) : row.phone_e164;
      const email = isSealed(row.email) ? codec.open(row.email) : row.email;
      const updated = await prisma.$executeRaw(Prisma.sql`
        UPDATE leads SET
          full_name = ${isSealed(row.full_name) ? row.full_name : codec.seal(row.full_name)},
          phone_e164 = ${isSealed(row.phone_e164) ? row.phone_e164 : codec.seal(row.phone_e164)},
          email = ${isSealed(row.email) ? row.email : codec.seal(row.email)},
          phone_hash = ${active && phone !== '' ? codec.hash(phone) : null},
          email_hash = ${active && email !== '' ? codec.hash(email.trim().toLowerCase()) : null}
        WHERE id = ${row.id}::uuid
          AND full_name = ${row.full_name} AND phone_e164 = ${row.phone_e164} AND email = ${row.email}
      `);
      summary.leads += updated;
    }
    if (rows.length < batchSize) {
      break;
    }
  }

  summary.submissions = await sealTextColumn(prisma, codec, 'lead_submissions', 'response_snapshot', batchSize);
  summary.outboxEvents = await sealTextColumn(prisma, codec, 'outbox_events', 'payload', batchSize);

  if (summary.leads + summary.submissions + summary.outboxEvents > 0) {
    log('Backfill de datos personales aplicado', { ...summary });
  }
  return summary;
}

async function sealTextColumn(
  prisma: PrismaClient,
  codec: PiiCodec,
  table: 'lead_submissions' | 'outbox_events',
  column: 'response_snapshot' | 'payload',
  batchSize: number,
): Promise<number> {
  const tableSql = Prisma.raw(`"${table}"`);
  const columnSql = Prisma.raw(`"${column}"`);
  let total = 0;
  for (let guard = 0; guard < 10_000; guard += 1) {
    const rows = await prisma.$queryRaw<LegacyTextRow[]>(Prisma.sql`
      SELECT id::text AS id, ${columnSql} AS value
      FROM ${tableSql}
      WHERE ${columnSql} !~ ${SEALED_PATTERN}
      ORDER BY id
      LIMIT ${batchSize}
    `);
    if (rows.length === 0) {
      break;
    }
    for (const row of rows) {
      total += await prisma.$executeRaw(Prisma.sql`
        UPDATE ${tableSql} SET ${columnSql} = ${codec.seal(row.value)}
        WHERE id = ${row.id}::uuid AND ${columnSql} = ${row.value}
      `);
    }
    if (rows.length < batchSize) {
      break;
    }
  }
  return total;
}
