import type { PinoLogger } from 'nestjs-pino';
import type { AppLogger } from '../../application/ports/logger';

/**
 * Adaptador del puerto `AppLogger` sobre pino. Añade `context` a cada línea
 * sin mutar el logger compartido (no usa `setContext`).
 */
export class PinoAppLogger implements AppLogger {
  constructor(
    private readonly logger: PinoLogger,
    private readonly context: string,
  ) {}

  debug(context: Record<string, unknown>, message: string): void {
    this.logger.debug({ context: this.context, ...context }, message);
  }

  info(context: Record<string, unknown>, message: string): void {
    this.logger.info({ context: this.context, ...context }, message);
  }

  warn(context: Record<string, unknown>, message: string): void {
    this.logger.warn({ context: this.context, ...context }, message);
  }

  error(context: Record<string, unknown>, message: string): void {
    this.logger.error({ context: this.context, ...context }, message);
  }
}
