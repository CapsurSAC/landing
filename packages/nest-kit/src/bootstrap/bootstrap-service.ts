import { Logger as NestLogger, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { unauthorizedProblem } from '../auth/internal-auth.guard';
import { InternalTokenVerifier, type InternalTokens } from '../auth/internal-token-verifier';
import { ProblemDetailsFilter } from '../errors/problem-details.filter';
import { jsonOnlyMiddleware } from './json-only.middleware';

/** Rutas de Swagger (C14). */
export const SWAGGER_UI_PATH = 'internal/docs';
export const SWAGGER_JSON_PATH = 'internal/docs-json';

/** Opciones de Swagger para {@link bootstrapService}. */
export interface BootstrapSwaggerOptions {
  title: string;
  description: string;
  /** Documento propio (p. ej. generado desde los esquemas Zod). Por defecto, el de los decoradores de Nest. */
  document?: (app: INestApplication) => OpenAPIObject;
}

/** Opciones de {@link bootstrapService}. */
export interface BootstrapOptions {
  service: string;
  version: string;
  /** Orígenes CORS permitidos; vacío = CORS desactivado. */
  corsOrigins: readonly string[];
  swagger?: BootstrapSwaggerOptions;
  /** Límite del cuerpo JSON. Por defecto `'100kb'`. */
  jsonLimit?: string | number;
  /** Prefijos de ruta exentos del 415 (cuerpos no JSON permitidos). */
  contentTypeExemptPrefixes?: readonly string[];
  /** Ajustes CORS adicionales. */
  cors?: { methods?: string[]; allowedHeaders?: string[]; exposedHeaders?: string[] };
  /** `trust proxy` de Express. Por defecto 1 (un salto: el gateway). */
  trustProxy?: number | boolean | string;
  /** Registra `ProblemDetailsFilter` como filtro global. Por defecto `true`. */
  problemDetailsFilter?: boolean;
  /** Por defecto `process.env.NODE_ENV`. */
  nodeEnv?: string;
  /** Por defecto `process.env.SWAGGER_ENABLED` (`true`/`1`). */
  swaggerEnabled?: boolean;
  /**
   * Tokens para proteger Swagger en producción si el servicio no importa
   * `InternalAuthModule`. Por defecto `process.env.INTERNAL_API_TOKENS`.
   */
  internalTokensJson?: string | InternalTokens;
}

/** Función que arranca el servidor HTTP en `0.0.0.0`. */
export type ListenFunction = (port: number, host?: string) => Promise<void>;

const DEFAULT_ALLOWED_HEADERS = ['Content-Type', 'Accept', 'Idempotency-Key', 'X-Request-Id', 'X-Lead-Token'];
const DEFAULT_EXPOSED_HEADERS = ['Idempotent-Replayed', 'Retry-After', 'X-Request-Id', 'ETag'];

function isTruthyFlag(value: string | undefined): boolean {
  return value !== undefined && ['true', '1'].includes(value.trim().toLowerCase());
}

/** `true` si Swagger debe exponerse: fuera de producción o con `SWAGGER_ENABLED=true`. */
export function isSwaggerEnabled(nodeEnv: string | undefined, swaggerEnabled: boolean | undefined): boolean {
  return nodeEnv !== 'production' || swaggerEnabled === true;
}

function resolveVerifier(app: INestApplication, tokens: string | InternalTokens | undefined): InternalTokenVerifier {
  try {
    return app.get(InternalTokenVerifier, { strict: false });
  } catch {
    return new InternalTokenVerifier(tokens ?? process.env.INTERNAL_API_TOKENS);
  }
}

/**
 * Configuración HTTP común a los servicios. Llamar justo después de
 * `NestFactory.create(AppModule, { bufferLogs: true })`:
 * - logger de nestjs-pino (si `createLoggerModule` está importado);
 * - helmet, CORS, `trust proxy` 1, sin `x-powered-by`;
 * - JSON con límite de 100 kb (respeta `rawBody: true`) y 415 para cuerpos no JSON;
 * - `ProblemDetailsFilter` global y `enableShutdownHooks`;
 * - Swagger en `/internal/docs` y `/internal/docs-json` solo fuera de
 *   producción o con `SWAGGER_ENABLED=true`; en producción exige token interno.
 *
 * Sentry no se inicia aquí: `initSentry` debe ejecutarse antes de crear la app.
 *
 * @example
 * const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
 * const listen = bootstrapService(app, { service: SERVICE_NAME, version: SERVICE_VERSION, corsOrigins: env.CORS_ORIGINS, swagger: { title: SERVICE_NAME, description: 'Leads' } });
 * await listen(env.PORT);
 */
export function bootstrapService(app: NestExpressApplication, options: BootstrapOptions): ListenFunction {
  try {
    app.useLogger(app.get(PinoNestLogger, { strict: false }));
  } catch {
    // Sin LoggerModule: se mantiene el logger por defecto de Nest.
  }
  app.flushLogs();
  const logger = new NestLogger('Bootstrap');
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  app.set('trust proxy', options.trustProxy ?? 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.enableCors({
    origin: options.corsOrigins.length > 0 ? [...options.corsOrigins] : false,
    methods: options.cors?.methods ?? ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: options.cors?.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS,
    exposedHeaders: options.cors?.exposedHeaders ?? DEFAULT_EXPOSED_HEADERS,
    maxAge: 600,
  });

  app.use(jsonOnlyMiddleware(options.contentTypeExemptPrefixes ?? []));
  // useBodyParser respeta `rawBody: true` de NestFactory.create (firma de webhooks).
  app.useBodyParser('json', { limit: options.jsonLimit ?? '100kb' });

  if (options.problemDetailsFilter !== false) {
    app.useGlobalFilters(new ProblemDetailsFilter());
  }
  app.enableShutdownHooks();

  const swaggerEnabled = isSwaggerEnabled(nodeEnv, options.swaggerEnabled ?? isTruthyFlag(process.env.SWAGGER_ENABLED));
  if (options.swagger && swaggerEnabled) {
    if (nodeEnv === 'production') {
      const verifier = resolveVerifier(app, options.internalTokensJson);
      const requireToken = (req: Request, _res: Response, next: NextFunction): void => {
        next(verifier.identifyAuthorization(req.headers.authorization) ? undefined : unauthorizedProblem());
      };
      app.use(`/${SWAGGER_UI_PATH}`, requireToken);
      app.use(`/${SWAGGER_JSON_PATH}`, requireToken);
    }
    const document =
      options.swagger.document?.(app) ??
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle(options.swagger.title)
          .setDescription(options.swagger.description)
          .setVersion(options.version)
          .addBearerAuth()
          .build(),
      );
    SwaggerModule.setup(SWAGGER_UI_PATH, app, document, { jsonDocumentUrl: SWAGGER_JSON_PATH });
  }

  return async (port: number, host = '0.0.0.0'): Promise<void> => {
    await app.listen(port, host);
    logger.log(
      { service: options.service, version: options.version, port, swagger: Boolean(options.swagger && swaggerEnabled) },
      `${options.service} v${options.version} escuchando en http://${host}:${port}`,
    );
  };
}
