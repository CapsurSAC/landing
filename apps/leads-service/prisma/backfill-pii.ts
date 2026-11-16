/**
 * Cifra los datos personales que quedaron en claro antes de la migración
 * `20261113230000_pii_compliance` (C8). Idempotente: se puede ejecutar
 * cuantas veces haga falta. El servicio también lo ejecuta al arrancar.
 *
 *   pnpm --filter @capsur/leads-service db:backfill-pii
 *
 * Usa DATABASE_URL, PII_ENCRYPTION_KEY y PII_HASH_KEY del entorno o de `.env`.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from './generated/client';
import { backfillPii } from '../src/infrastructure/pii/pii-backfill';
import { PiiCodec } from '../src/infrastructure/pii/pii-codec';

async function main(): Promise<void> {
  const dotenv = resolve(__dirname, '..', '.env');
  if (existsSync(dotenv)) {
    process.loadEnvFile(dotenv);
  }
  const { DATABASE_URL, PII_ENCRYPTION_KEY, PII_HASH_KEY } = process.env;
  if (!DATABASE_URL || !PII_ENCRYPTION_KEY || !PII_HASH_KEY) {
    throw new Error('Faltan DATABASE_URL, PII_ENCRYPTION_KEY o PII_HASH_KEY');
  }
  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
  try {
    const summary = await backfillPii(prisma, new PiiCodec(PII_ENCRYPTION_KEY, PII_HASH_KEY));
    process.stdout.write(
      `Backfill PII: ${summary.leads} leads, ${summary.submissions} submissions, ${summary.outboxEvents} eventos de outbox cifrados\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Backfill PII falló: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
