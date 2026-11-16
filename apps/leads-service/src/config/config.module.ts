import { Module, type DynamicModule } from '@nestjs/common';
import { ENV, type Env } from './env';

/** Expone el entorno ya validado bajo el token `ENV` (global). */
@Module({})
export class AppConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppConfigModule,
      global: true,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
