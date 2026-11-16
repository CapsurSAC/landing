/**
 * Paso de datos de la migración 20261113170000_v2_integrations (C8): cifra los
 * `sync_jobs.payload` heredados. Lo ejecuta `pnpm db:migrate` tras `prisma migrate deploy`.
 * Necesita `DATABASE_URL` y `PII_ENCRYPTION_KEY` (lee `.env` si existe). Sin la clave no
 * falla: el servicio lo completa al arrancar.
 */
import { PiiCipher } from '@capsur/nest-kit';
import { loadDotEnvFile } from '../src/config/dotenv';
import { encryptLegacyPayloads } from '../src/infrastructure/prisma/legacy-payload-encryption';
import { PrismaClient } from './generated/client';

async function main(): Promise<void> {
  loadDotEnvFile();
  const key = process.env.PII_ENCRYPTION_KEY;
  if (!key) {
    process.stdout.write('PII_ENCRYPTION_KEY no definida: los payloads heredados se cifrarán al arrancar el servicio\n');
    return;
  }
  const prisma = new PrismaClient();
  try {
    const converted = await encryptLegacyPayloads(prisma, new PiiCipher(key));
    process.stdout.write(`sync_jobs: ${converted} payload(s) heredado(s) cifrado(s)\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`No se pudieron cifrar los payloads heredados: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
