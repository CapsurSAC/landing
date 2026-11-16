import { z } from 'zod';
import { withEnvContext, type EnvSource } from './context';

export type { EnvSource };

/** Forma de un esquema de entorno: nombre de variable → esquema Zod. */
export type EnvShape = Record<string, z.ZodType>;

/** Ejemplos (valores de desarrollo) por variable, para `.env.example`. */
export type EnvExamples<S extends EnvShape> = { readonly [K in keyof S]?: string };

/** Comentario por variable para `.env.example` (alternativa a `.describe()` en el esquema). */
export type EnvDescriptions<S extends EnvShape> = { readonly [K in keyof S]?: string };

/** Opciones de {@link defineEnv}. */
export interface DefineEnvOptions<S extends EnvShape> {
  /** Valor de ejemplo de cada variable (nunca secretos reales). */
  examples: EnvExamples<S>;
  /** Comentario por variable; si falta, se usa la descripción del esquema (`.describe()`). */
  describe?: EnvDescriptions<S>;
  /** Encabezado opcional del `.env.example` (sin `#`). */
  title?: string;
}

/** Variable inválida (sin su valor: puede ser un secreto). */
export interface EnvIssue {
  variable: string;
  message: string;
}

/** Error de configuración con un mensaje legible que lista cada variable inválida. */
export class EnvValidationError extends Error {
  constructor(readonly issues: readonly EnvIssue[]) {
    super(
      [
        `Configuración inválida: ${issues.length} variable(s) de entorno con problemas:`,
        ...issues.map((issue) => `  - ${issue.variable}: ${issue.message}`),
      ].join('\n'),
    );
    this.name = 'EnvValidationError';
  }
}

/** Definición de entorno de un servicio. */
export interface EnvDefinition<S extends EnvShape> {
  readonly shape: S;
  readonly schema: z.ZodObject<S>;
  readonly examples: EnvExamples<S>;
  readonly descriptions: EnvDescriptions<S>;
  readonly title: string | undefined;
  /** Valida `env` (por defecto `process.env`) y lanza {@link EnvValidationError} si algo falla. */
  parse(env?: EnvSource): z.output<z.ZodObject<S>>;
}

/** Tipo de la configuración resultante de una definición. */
export type EnvOf<D> = D extends EnvDefinition<infer S> ? z.output<z.ZodObject<S>> : never;

function toIssues(error: z.ZodError, env: EnvSource): EnvIssue[] {
  const byVariable = new Map<string, string[]>();
  for (const issue of error.issues) {
    const [first, ...rest] = issue.path.map(String);
    const variable = first ?? '(raíz)';
    const missing = rest.length === 0 && issue.code === 'invalid_type' && env[variable] === undefined;
    const message = missing ? 'no está definida' : rest.length > 0 ? `${rest.join('.')}: ${issue.message}` : issue.message;
    const list = byVariable.get(variable) ?? [];
    if (!list.includes(message)) {
      list.push(message);
    }
    byVariable.set(variable, list);
  }
  return [...byVariable.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([variable, messages]) => ({ variable, message: messages.join('; ') }));
}

/**
 * Define el esquema de entorno de un servicio componiendo fragmentos.
 *
 * @example
 * export const envDefinition = defineEnv(
 *   { NODE_ENV: nodeEnvSchema, PORT: portSchema.default(3002), DATABASE_URL: databaseUrlSchema },
 *   { examples: { NODE_ENV: 'development', PORT: '3002', DATABASE_URL: 'postgresql://leads:leads@localhost:5432/leads' } },
 * );
 */
export function defineEnv<S extends EnvShape>(shape: S, options: DefineEnvOptions<S>): EnvDefinition<S> {
  const schema = z.object(shape);
  return {
    shape,
    schema,
    examples: options.examples,
    descriptions: options.describe ?? {},
    title: options.title,
    parse(env: EnvSource = process.env) {
      const result = withEnvContext(env, () => schema.safeParse(env));
      if (!result.success) {
        throw new EnvValidationError(toIssues(result.error, env));
      }
      return result.data;
    },
  };
}

/**
 * Carga y valida el entorno. Pensado para el arranque del servicio: si
 * falla, el mensaje lista cada variable inválida sin mostrar valores.
 *
 * @example
 * export const env = loadEnv(envDefinition);
 */
export function loadEnv<S extends EnvShape>(definition: EnvDefinition<S>, env: EnvSource = process.env): z.output<z.ZodObject<S>> {
  return definition.parse(env);
}

/** Comprueba en tiempo de ejecución que un valor es una {@link EnvDefinition}. */
export function isEnvDefinition(value: unknown): value is EnvDefinition<EnvShape> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'shape' in value &&
    'examples' in value &&
    'parse' in value &&
    typeof (value as { parse: unknown }).parse === 'function'
  );
}
