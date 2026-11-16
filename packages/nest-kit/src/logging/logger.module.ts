import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DynamicModule } from '@nestjs/common';
import { LoggerModule, type Params } from 'nestjs-pino';
import pino, { type DestinationStream, type LevelWithSilent } from 'pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import { REDACTED, REDACT_PATHS } from './redaction';
import { resolveRequestId } from './request-id';

/** Opciones de {@link createLoggerModule}. */
export interface LoggerModuleOptions {
  /** Nombre del servicio; se añade a cada línea como `service`. */
  service: string;
  /** Nivel mínimo. Por defecto `info` (`silent` si `NODE_ENV=test`). */
  level?: LevelWithSilent;
  /** Entorno; por defecto `process.env.NODE_ENV`. */
  nodeEnv?: string;
  /** Rutas de redacción adicionales a {@link REDACT_PATHS}. */
  extraRedactPaths?: readonly string[];
  /** Fuerza (o desactiva) `pino-pretty`. Por defecto solo fuera de producción y pruebas. */
  pretty?: boolean;
  /** Prefijos de ruta que no generan log automático de petición. Por defecto `['/internal/health']`. */
  autoLoggingIgnorePrefixes?: readonly string[];
}

/** Opciones de pino comunes (nivel, base, redacción); también sirven para loggers fuera de HTTP. */
export function buildPinoOptions(options: LoggerModuleOptions): pino.LoggerOptions {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  return {
    level: options.level ?? (nodeEnv === 'test' ? 'silent' : 'info'),
    base: { service: options.service },
    redact: { paths: [...REDACT_PATHS, ...(options.extraRedactPaths ?? [])], censor: REDACTED },
  };
}

/** Ruta absoluta de `pino-pretty` si está instalado (solo en desarrollo). */
function resolvePrettyTarget(): string | null {
  try {
    return require.resolve('pino-pretty');
  } catch {
    return null;
  }
}

/**
 * Parámetros de nestjs-pino:
 * - `genReqId` que respeta/devuelve `x-request-id`;
 * - redacción común ({@link REDACT_PATHS});
 * - producción: JSON con `pino.destination({ sync: false })` (escritura asíncrona);
 * - desarrollo: `pino-pretty` en un worker (transporte fuera del event loop);
 * - sin log automático de `/internal/health`.
 */
export function buildLoggerParams(options: LoggerModuleOptions): Params {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const ignorePrefixes = options.autoLoggingIgnorePrefixes ?? ['/internal/health'];
  const base = buildPinoOptions(options);

  const httpOptions: PinoHttpOptions<IncomingMessage, ServerResponse> = {
    ...base,
    genReqId: resolveRequestId,
    quietReqLogger: true,
    autoLogging: {
      ignore: (req) => {
        const url = req.url ?? '';
        return ignorePrefixes.some((prefix) => url.startsWith(prefix));
      },
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) {
        return 'error';
      }
      return res.statusCode >= 400 ? 'warn' : 'info';
    },
  };

  if (nodeEnv === 'production') {
    const destination: DestinationStream = pino.destination({ sync: false });
    return { pinoHttp: [httpOptions, destination] };
  }

  const wantsPretty = options.pretty ?? nodeEnv !== 'test';
  const prettyTarget = wantsPretty ? resolvePrettyTarget() : null;
  if (prettyTarget) {
    httpOptions.transport = {
      target: prettyTarget,
      options: { colorize: true, singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
    };
  }
  return { pinoHttp: httpOptions };
}

/**
 * Módulo de logging listo para importar en el módulo raíz.
 *
 * @example
 * imports: [createLoggerModule({ service: 'leads-service', level: env.LOG_LEVEL })]
 */
export function createLoggerModule(options: LoggerModuleOptions): DynamicModule {
  return LoggerModule.forRoot(buildLoggerParams(options));
}
