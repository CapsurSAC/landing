import { buildLoggerParams } from '@capsur/nest-kit';
import { type Params } from 'nestjs-pino';
import { type Options as PinoHttpOptions } from 'pino-http';
import { type Env } from '../../config/env.definition';
import { SERVICE_NAME } from '../../config/service-info';

/** El secreto del webhook viaja en `?token=`: se oculta en la URL que registra pino-http. */
export function scrubWebhookToken(url: unknown): unknown {
  return typeof url === 'string' ? url.replace(/([?&]token=)[^&#]*/gi, '$1[REDACTED]') : url;
}

function withScrubbedRequestUrl(options: PinoHttpOptions): PinoHttpOptions {
  return {
    ...options,
    serializers: {
      ...options.serializers,
      req: (req: Record<string, unknown>) => ({ ...req, url: scrubWebhookToken(req.url) }),
    },
  };
}

/** Logging del kit (B21, C26) más la redacción del token del webhook en URL y query. */
export function loggerParams(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Params {
  const params = buildLoggerParams({
    service: SERVICE_NAME,
    level: env.LOG_LEVEL,
    nodeEnv: env.NODE_ENV,
    extraRedactPaths: ['req.query.token'],
  });
  const pinoHttp = params.pinoHttp;
  if (Array.isArray(pinoHttp)) {
    const [options, destination] = pinoHttp;
    return { ...params, pinoHttp: [withScrubbedRequestUrl(options), destination] };
  }
  if (pinoHttp && !('write' in pinoHttp)) {
    return { ...params, pinoHttp: withScrubbedRequestUrl(pinoHttp) };
  }
  return params;
}
