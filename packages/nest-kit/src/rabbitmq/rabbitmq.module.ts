import { Module, type DynamicModule, type InjectionToken, type ModuleMetadata, type Provider } from '@nestjs/common';
import { createHealthIndicator, type HealthIndicator } from '../health/health.service';
import { EVENT_PUBLISHER } from './envelope';
import { RABBITMQ_OPTIONS, RabbitMqConnection, type RabbitMqConnectionOptions } from './rabbitmq-connection';
import { RabbitMqPublisher } from './rabbitmq-publisher';

/** Opciones asíncronas de {@link RabbitMqModule}. */
export interface RabbitMqModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: InjectionToken[];
  useFactory: (...args: never[]) => RabbitMqConnectionOptions | Promise<RabbitMqConnectionOptions>;
}

const SHARED_PROVIDERS: Provider[] = [
  RabbitMqConnection,
  RabbitMqPublisher,
  { provide: EVENT_PUBLISHER, useExisting: RabbitMqPublisher },
];

/**
 * Conexión y publicador de RabbitMQ compartidos (global).
 *
 * @example
 * RabbitMqModule.forRoot({ url: env.RABBITMQ_URL, connectionName: 'leads-service' })
 */
@Module({})
export class RabbitMqModule {
  static forRoot(options: RabbitMqConnectionOptions): DynamicModule {
    return {
      module: RabbitMqModule,
      global: true,
      providers: [{ provide: RABBITMQ_OPTIONS, useValue: options }, ...SHARED_PROVIDERS],
      exports: [RabbitMqConnection, RabbitMqPublisher, EVENT_PUBLISHER],
    };
  }

  static forRootAsync(options: RabbitMqModuleAsyncOptions): DynamicModule {
    return {
      module: RabbitMqModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        { provide: RABBITMQ_OPTIONS, useFactory: options.useFactory, inject: options.inject ?? [] },
        ...SHARED_PROVIDERS,
      ],
      exports: [RabbitMqConnection, RabbitMqPublisher, EVENT_PUBLISHER],
    };
  }
}

/** Indicador de salud `rabbitmq` (no crítico por defecto: el outbox/reintentos absorben la caída). */
export function rabbitMqHealthIndicator(connection: RabbitMqConnection, critical = false): HealthIndicator {
  return createHealthIndicator('rabbitmq', critical, () => connection.isConnected());
}
