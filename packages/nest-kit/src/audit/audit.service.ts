import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { AuditEntry } from '@capsur/api-contracts';
import { redactDeep } from '../logging/redaction';

export type { AuditEntry };

/** Token del puerto {@link AuditStore}. */
export const AUDIT_STORE = Symbol('AUDIT_STORE');

/**
 * Puerto de persistencia de auditoría. Cada servicio aporta su implementación
 * Prisma sobre la tabla `audit_log` (`id, at, caller, actor, action, target, metadata`).
 */
export interface AuditStore {
  record(entry: AuditEntry): Promise<void>;
  /** Últimas `limit` entradas, de la más reciente a la más antigua. */
  list(limit: number): Promise<AuditEntry[]>;
}

/** Datos que aporta quien audita; `id` y `at` los pone el servicio. */
export interface AuditInput {
  caller: string;
  actor?: string | null;
  action: string;
  target?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Store por defecto: no persiste (el log estructurado ya lo hace `AuditService`). */
export class LogOnlyAuditStore implements AuditStore {
  async record(_entry: AuditEntry): Promise<void> {
    // Sin persistencia: la entrada ya quedó en el log con `audit: true`.
  }

  async list(_limit: number): Promise<AuditEntry[]> {
    return [];
  }
}

/** Límite máximo de `list` para no devolver tablas enteras. */
export const MAX_AUDIT_LIST_LIMIT = 500;

/**
 * Registra acciones internas (C24): siempre en el log estructurado con
 * `audit: true` y, además, en el {@link AuditStore} del servicio. Un fallo
 * del store se loguea pero no rompe la operación ya realizada.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  private readonly store: AuditStore;

  constructor(@Optional() @Inject(AUDIT_STORE) store?: AuditStore) {
    this.store = store ?? new LogOnlyAuditStore();
  }

  async record(input: AuditInput): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: randomUUID(),
      at: new Date().toISOString(),
      caller: input.caller,
      actor: input.actor ?? null,
      action: input.action,
      target: input.target ?? null,
      // La auditoría nunca guarda datos personales en claro.
      metadata: input.metadata ? redactDeep(input.metadata) : null,
    };
    this.logger.log({ audit: true, ...entry }, `Auditoría: ${entry.action}`);
    try {
      await this.store.record(entry);
    } catch (error) {
      this.logger.error(
        { audit: true, auditId: entry.id, err: error instanceof Error ? { type: error.name, message: error.message } : undefined },
        'No se pudo persistir la entrada de auditoría',
      );
    }
    return entry;
  }

  /** Últimas entradas (1 ≤ limit ≤ 500). */
  async list(limit = 50): Promise<AuditEntry[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_AUDIT_LIST_LIMIT);
    return this.store.list(safeLimit);
  }
}
