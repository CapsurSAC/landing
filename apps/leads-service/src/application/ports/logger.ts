/**
 * Logger mínimo para la capa de aplicación. La infraestructura lo implementa
 * con pino; los tests usan un fake silencioso.
 */
export interface AppLogger {
  debug(context: Record<string, unknown>, message: string): void;
  info(context: Record<string, unknown>, message: string): void;
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export const APP_LOGGER = Symbol('APP_LOGGER');
