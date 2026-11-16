import { Logger, Module, type DynamicModule, type InjectionToken, type ModuleMetadata, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InternalAuthGuard, InternalPathsAuthGuard } from './internal-auth.guard';
import { InternalTokenVerifier, type InternalTokens } from './internal-token-verifier';

/** Token con las opciones de {@link InternalAuthModule}. */
export const INTERNAL_AUTH_OPTIONS = Symbol('INTERNAL_AUTH_OPTIONS');

/** Opciones de {@link InternalAuthModule.forRoot}. */
export interface InternalAuthModuleOptions {
  /** `INTERNAL_API_TOKENS`: JSON `{ "<caller>": "<token>" }` u objeto ya validado. */
  tokensJson: string | InternalTokens;
  /**
   * Si es `true` (por defecto), registra un guard global que exige token en
   * todas las rutas `/internal/*` salvo las marcadas con `@Public()`.
   */
  protectInternalPaths?: boolean;
}

/** Opciones asíncronas (p. ej. leyendo de `ConfigService`). */
export interface InternalAuthModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: InjectionToken[];
  useFactory: (...args: never[]) => InternalAuthModuleOptions | Promise<InternalAuthModuleOptions>;
  /** Igual que en `forRoot`; se fija aquí porque decide qué providers se registran. */
  protectInternalPaths?: boolean;
}

function createVerifier(options: InternalAuthModuleOptions): InternalTokenVerifier {
  const verifier = new InternalTokenVerifier(options.tokensJson);
  if (verifier.size === 0) {
    new Logger('InternalAuthModule').warn('INTERNAL_API_TOKENS está vacío: toda ruta protegida responderá 401');
  }
  return verifier;
}

function buildProviders(optionsProvider: Provider, protect: boolean): Provider[] {
  const providers: Provider[] = [
    optionsProvider,
    { provide: InternalTokenVerifier, useFactory: createVerifier, inject: [INTERNAL_AUTH_OPTIONS] },
    InternalAuthGuard,
  ];
  if (protect) {
    providers.push({ provide: APP_GUARD, useClass: InternalPathsAuthGuard });
  }
  return providers;
}

/**
 * Autenticación entre servicios (C4). Global: el guard y el verificador
 * quedan disponibles en todo el servicio.
 *
 * @example
 * InternalAuthModule.forRoot({ tokensJson: env.INTERNAL_API_TOKENS })
 */
@Module({})
export class InternalAuthModule {
  static forRoot(options: InternalAuthModuleOptions): DynamicModule {
    return {
      module: InternalAuthModule,
      global: true,
      providers: buildProviders({ provide: INTERNAL_AUTH_OPTIONS, useValue: options }, options.protectInternalPaths ?? true),
      exports: [InternalTokenVerifier, InternalAuthGuard, INTERNAL_AUTH_OPTIONS],
    };
  }

  static forRootAsync(options: InternalAuthModuleAsyncOptions): DynamicModule {
    return {
      module: InternalAuthModule,
      global: true,
      imports: options.imports ?? [],
      providers: buildProviders(
        { provide: INTERNAL_AUTH_OPTIONS, useFactory: options.useFactory, inject: options.inject ?? [] },
        options.protectInternalPaths ?? true,
      ),
      exports: [InternalTokenVerifier, InternalAuthGuard, INTERNAL_AUTH_OPTIONS],
    };
  }
}
