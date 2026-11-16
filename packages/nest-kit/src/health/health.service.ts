import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Health } from '@capsur/api-contracts';

/** Comprobación de una dependencia para `GET /internal/health`. */
export interface HealthIndicator {
  /** Nombre tal como aparece en `checks` (p. ej. `database`, `rabbitmq`, `redis`). */
  readonly name: string;
  /** Si es crítica y cae, el servicio queda `down` (503); si no, solo `degraded`. */
  readonly critical: boolean;
  /** `true` si la dependencia responde. Un rechazo o un timeout cuentan como caída. */
  check(): Promise<boolean>;
}

/**
 * Campos adicionales del informe de salud (p. ej. `outbox` en leads-service).
 * Recibe los `checks` ya calculados para poder omitir consultas si la base cae.
 */
export interface HealthExtras {
  collect(context: { checks: Readonly<Record<string, 'up' | 'down'>>; status: Health['status'] }): Promise<Record<string, unknown>>;
}

/** Informe devuelto por `/internal/health` (contrato `HealthSchema` + extras). */
export type HealthReport = Health & Record<string, unknown>;

/** Opciones de {@link HealthModule.forRoot}. */
export interface HealthModuleOptions {
  service: string;
  version: string;
  /** Vida de la caché del resultado. Por defecto 5000 ms. */
  cacheTtlMs?: number;
  /** Tiempo máximo por chequeo. Por defecto 1500 ms. */
  checkTimeoutMs?: number;
}

/** Token de las opciones de salud. */
export const HEALTH_OPTIONS = Symbol('HEALTH_OPTIONS');
/** Token opcional de {@link HealthExtras}. */
export const HEALTH_EXTRAS = Symbol('HEALTH_EXTRAS');
/** Token opcional con indicadores iniciales (`HealthIndicator[]`). */
export const HEALTH_INDICATORS = Symbol('HEALTH_INDICATORS');

const DEFAULT_CACHE_TTL_MS = 5000;
const DEFAULT_CHECK_TIMEOUT_MS = 1500;

/** Crea un indicador a partir de una función. */
export function createHealthIndicator(name: string, critical: boolean, check: () => Promise<boolean> | boolean): HealthIndicator {
  return { name, critical, check: async () => check() };
}

/** Resultado de un chequeo: `true` solo si responde `true` antes del timeout. */
async function runCheck(indicator: HealthIndicator, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([indicator.check().then((up) => up === true), timeout]);
  } catch {
    return false;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Agrega los indicadores registrados con caché de 5 s (las peticiones
 * concurrentes comparten el mismo cálculo) y timeout de 1,5 s por chequeo.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger('Health');
  private readonly indicators = new Map<string, HealthIndicator>();
  private extras: HealthExtras | null;
  private cached: { report: HealthReport; expiresAt: number } | null = null;
  private inFlight: Promise<HealthReport> | null = null;
  private readonly cacheTtlMs: number;
  private readonly checkTimeoutMs: number;

  constructor(
    @Inject(HEALTH_OPTIONS) private readonly options: HealthModuleOptions,
    @Optional() @Inject(HEALTH_EXTRAS) extras?: HealthExtras,
    @Optional() @Inject(HEALTH_INDICATORS) indicators?: readonly HealthIndicator[],
  ) {
    this.extras = extras ?? null;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.checkTimeoutMs = options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
    for (const indicator of indicators ?? []) {
      this.register(indicator);
    }
  }

  /** Registra (o reemplaza por nombre) un indicador. Invalida la caché. */
  register(indicator: HealthIndicator): void {
    this.indicators.set(indicator.name, indicator);
    this.cached = null;
  }

  /** Instala el proveedor de campos extra. */
  setExtras(extras: HealthExtras | null): void {
    this.extras = extras;
    this.cached = null;
  }

  /** Informe actual (cacheado durante `cacheTtlMs`). */
  async report(): Promise<HealthReport> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.report;
    }
    if (!this.inFlight) {
      this.inFlight = this.compute()
        .then((report) => {
          this.cached = { report, expiresAt: Date.now() + this.cacheTtlMs };
          return report;
        })
        .finally(() => {
          this.inFlight = null;
        });
    }
    return this.inFlight;
  }

  private async compute(): Promise<HealthReport> {
    const indicators = [...this.indicators.values()];
    const results = await Promise.all(
      indicators.map(async (indicator) => ({ indicator, up: await runCheck(indicator, this.checkTimeoutMs) })),
    );
    const checks: Record<string, 'up' | 'down'> = {};
    for (const { indicator, up } of results) {
      checks[indicator.name] = up ? 'up' : 'down';
    }
    const criticalDown = results.some((result) => !result.up && result.indicator.critical);
    const anyDown = results.some((result) => !result.up);
    const status: Health['status'] = criticalDown ? 'down' : anyDown ? 'degraded' : 'ok';

    let extra: Record<string, unknown> = {};
    if (this.extras) {
      try {
        extra = await this.extras.collect({ checks, status });
      } catch (error) {
        this.logger.warn(
          { err: error instanceof Error ? { type: error.name, message: error.message } : undefined },
          'No se pudieron calcular los campos extra de salud',
        );
      }
    }

    return {
      ...extra,
      status,
      service: this.options.service,
      version: this.options.version,
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
