import { Inject, Injectable } from '@nestjs/common';
import { CampusSchema, CreateLeadResponseSchema } from '@capsur/api-contracts';
import type { StoredLeadResponse } from '../../application/ports/idempotency-cache';
import type { NewSubmission, StoredSubmission, SubmissionRepository } from '../../application/ports/submission-repository';
import { PII_CODEC, PiiCodec } from '../pii/pii-codec';
import { PrismaService } from './prisma.service';

/**
 * Esquema tolerante de la respuesta guardada: sin `statusToken` (no se guarda)
 * y con `campus`/`specialties` por defecto para las filas anteriores a v2.
 */
export const StoredLeadResponseSchema = CreateLeadResponseSchema.omit({ statusToken: true }).extend({
  campus: CampusSchema.default('tacna'),
});

/** Interpreta un snapshot guardado; `null` si no es utilizable (p. ej. lead anonimizado). */
export function parseStoredResponse(codec: PiiCodec, stored: string): StoredLeadResponse | null {
  try {
    const parsed = StoredLeadResponseSchema.safeParse(codec.openJson(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

@Injectable()
export class PrismaSubmissionRepository implements SubmissionRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PII_CODEC) private readonly codec: PiiCodec,
  ) {}

  /** Única lectura de `response_snapshot` (B12): solo para resolver un replay. */
  async findByIdempotencyKey(scopedKey: string): Promise<StoredSubmission | null> {
    const row = await this.prisma.leadSubmission.findUnique({
      where: { idempotencyKey: scopedKey },
      select: { leadId: true, requestFingerprint: true, responseSnapshot: true },
    });
    if (!row) {
      return null;
    }
    return {
      leadId: row.leadId,
      requestFingerprint: row.requestFingerprint,
      responseSnapshot: parseStoredResponse(this.codec, row.responseSnapshot),
    };
  }

  async record(submission: NewSubmission): Promise<void> {
    await this.prisma.leadSubmission.create({
      data: {
        leadId: submission.leadId,
        idempotencyKey: submission.idempotencyKey,
        requestFingerprint: submission.requestFingerprint,
        ipHash: submission.ipHash,
        userAgent: submission.userAgent,
        outcome: submission.outcome,
        responseSnapshot: this.codec.sealJson(submission.responseSnapshot),
      },
      select: { id: true },
    });
  }
}
