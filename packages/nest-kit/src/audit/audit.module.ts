import { Module, type DynamicModule, type ModuleMetadata, type Provider, type Type } from '@nestjs/common';
import { AUDIT_STORE, AuditService, LogOnlyAuditStore, type AuditStore } from './audit.service';
import { AuditInterceptor } from './audited';

/** Opciones de {@link AuditModule.forRoot}. */
export interface AuditModuleOptions extends Pick<ModuleMetadata, 'imports'> {
  /**
   * Implementación del store (p. ej. `PrismaAuditStore`). Sus dependencias
   * deben resolverse con `imports`. Por defecto {@link LogOnlyAuditStore}.
   */
  store?: Type<AuditStore>;
}

/**
 * Auditoría de acciones internas (C24). Global para que `@Audited()` funcione
 * en cualquier controlador.
 *
 * @example
 * AuditModule.forRoot({ imports: [PrismaModule], store: PrismaAuditStore })
 */
@Module({})
export class AuditModule {
  static forRoot(options: AuditModuleOptions = {}): DynamicModule {
    const storeProvider: Provider = { provide: AUDIT_STORE, useClass: options.store ?? LogOnlyAuditStore };
    return {
      module: AuditModule,
      global: true,
      imports: options.imports ?? [],
      providers: [storeProvider, AuditService, AuditInterceptor],
      exports: [AuditService, AuditInterceptor, AUDIT_STORE],
    };
  }
}
