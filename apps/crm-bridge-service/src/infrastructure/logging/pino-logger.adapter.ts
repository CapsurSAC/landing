import { type PinoLogger } from 'nestjs-pino';
import { type LoggerPort } from '../../application/ports/logger';

/** Adapta `PinoLogger` al puerto de logging que usan los casos de uso. */
export class PinoLoggerAdapter implements LoggerPort {
  constructor(
    private readonly pino: PinoLogger,
    context: string,
  ) {
    this.pino.setContext(context);
  }

  debug(message: string, context: Record<string, unknown> = {}): void {
    this.pino.debug(context, message);
  }

  info(message: string, context: Record<string, unknown> = {}): void {
    this.pino.info(context, message);
  }

  warn(message: string, context: Record<string, unknown> = {}): void {
    this.pino.warn(context, message);
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.pino.error(context, message);
  }
}
