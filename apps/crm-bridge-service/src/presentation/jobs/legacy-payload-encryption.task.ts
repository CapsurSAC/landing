import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { type PiiCipher } from '@capsur/nest-kit';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PII_CIPHER } from '../../application/ports/tokens';
import { encryptLegacyPayloads } from '../../infrastructure/prisma/legacy-payload-encryption';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { errorMessage } from '../consumers/message';

/**
 * C8: al arrancar cifra los payloads heredados que aún estén en claro (p. ej. si el job de
 * migraciones del contenedor no tiene la clave). No bloquea el arranque.
 */
@Injectable()
export class LegacyPayloadEncryptionTask implements OnApplicationBootstrap {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PII_CIPHER) private readonly cipher: PiiCipher,
    @InjectPinoLogger(LegacyPayloadEncryptionTask.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    void encryptLegacyPayloads(this.prisma, this.cipher)
      .then((converted) => {
        if (converted > 0) {
          this.logger.info({ converted }, 'Payloads heredados de sync_jobs cifrados');
        }
      })
      .catch((error: unknown) => {
        this.logger.error({ error: errorMessage(error) }, 'No se pudieron cifrar los payloads heredados de sync_jobs');
      });
  }
}
