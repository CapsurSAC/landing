import { Module, type DynamicModule, type ModuleMetadata, type Provider, type Type } from '@nestjs/common';
import { HealthController } from './health.controller';
import {
  HEALTH_EXTRAS,
  HEALTH_INDICATORS,
  HEALTH_OPTIONS,
  HealthService,
  type HealthExtras,
  type HealthIndicator,
  type HealthModuleOptions,
} from './health.service';

/** Opciones de {@link HealthModule.forRoot}: datos del servicio más indicadores opcionales. */
export interface HealthModuleRootOptions extends HealthModuleOptions, Pick<ModuleMetadata, 'imports'> {
  /** Clases indicadoras (sus dependencias se resuelven con `imports`). */
  indicators?: Array<Type<HealthIndicator>>;
  /** Proveedor de campos extra (p. ej. contadores del outbox). */
  extras?: Type<HealthExtras>;
}

/**
 * Módulo de salud (B19). Global: cualquier proveedor puede inyectar
 * `HealthService` y llamar a `register(indicator)` en su `onModuleInit`.
 *
 * @example
 * HealthModule.forRoot({ service: SERVICE_NAME, version: SERVICE_VERSION, imports: [PrismaModule], indicators: [PrismaHealthIndicator] })
 */
@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleRootOptions): DynamicModule {
    const indicatorClasses = options.indicators ?? [];
    const providers: Provider[] = [
      {
        provide: HEALTH_OPTIONS,
        useValue: {
          service: options.service,
          version: options.version,
          cacheTtlMs: options.cacheTtlMs,
          checkTimeoutMs: options.checkTimeoutMs,
        } satisfies HealthModuleOptions,
      },
      ...indicatorClasses,
      {
        provide: HEALTH_INDICATORS,
        useFactory: (...instances: HealthIndicator[]) => instances,
        inject: indicatorClasses,
      },
      HealthService,
    ];
    if (options.extras) {
      providers.push({ provide: HEALTH_EXTRAS, useClass: options.extras });
    }
    return {
      module: HealthModule,
      global: true,
      imports: options.imports ?? [],
      controllers: [HealthController],
      providers,
      exports: [HealthService],
    };
  }
}
