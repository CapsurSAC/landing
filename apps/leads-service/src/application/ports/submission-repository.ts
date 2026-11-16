import type { StoredLeadResponse } from './idempotency-cache';

export type SubmissionOutcome = 'CREATED' | 'DUPLICATE' | 'REPLAYED';

export interface NewSubmission {
  leadId: string;
  /** Clave con alcance de IP (C19). */
  idempotencyKey: string;
  requestFingerprint: string;
  ipHash: string | null;
  userAgent: string | null;
  outcome: SubmissionOutcome;
  /** Se guarda cifrada; solo se vuelve a leer en un replay (B12). */
  responseSnapshot: StoredLeadResponse;
}

/** Lo mínimo para resolver un replay. */
export interface StoredSubmission {
  leadId: string;
  requestFingerprint: string;
  /** `null` si la respuesta ya no es utilizable (p. ej. el lead se anonimizó). */
  responseSnapshot: StoredLeadResponse | null;
}

export interface SubmissionRepository {
  findByIdempotencyKey(scopedKey: string): Promise<StoredSubmission | null>;
  record(submission: NewSubmission): Promise<void>;
}

export const SUBMISSION_REPOSITORY = Symbol('SUBMISSION_REPOSITORY');
