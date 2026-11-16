import { type LeadCreatedPayload } from '@capsur/api-contracts';

export type SyncJobStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'DEAD';
export const SYNC_JOB_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'DEAD'] as const satisfies readonly SyncJobStatus[];

export type AttemptStatus = 'SUCCESS' | 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE';

/** Trabajo de sincronización de un lead. Conserva el payload (cifrado en reposo) para reprocesar. */
export interface SyncJob {
  leadId: string;
  eventId: string;
  reference: string;
  /** null si el lead se anonimizó (C9): ya no se puede reprocesar. */
  payload: LeadCreatedPayload | null;
  status: SyncJobStatus;
  attempts: number;
  lastError: string | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Vista sin datos personales para los endpoints internos. */
export interface SyncJobSummary {
  leadId: string;
  reference: string;
  status: SyncJobStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export type SyncJobCounts = Record<'pending' | 'succeeded' | 'failed' | 'dead', number>;
