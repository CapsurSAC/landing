import type { z } from 'zod';
import type { EnvDefinition, EnvShape } from './define-env';

interface WrapperDef {
  innerType?: z.ZodType;
  in?: z.ZodType;
  out?: z.ZodType;
  schema?: z.ZodType;
}

/**
 * Descripción de un esquema. Zod 4 no propaga `.describe()` a los
 * envoltorios (`.optional()`, `.default()`, `pipe`), así que se recorren.
 */
export function descriptionOf(schema: z.ZodType, depth = 0): string | undefined {
  if (schema.description) {
    return schema.description;
  }
  if (depth > 6) {
    return undefined;
  }
  const def = (schema as unknown as { _zod?: { def?: WrapperDef } })._zod?.def;
  for (const inner of [def?.innerType, def?.in, def?.schema, def?.out]) {
    if (inner) {
      const found = descriptionOf(inner, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function formatValue(value: string): string {
  // Comillas simples solo si hace falta (espacios o #): Docker Compose y dotenv las entienden.
  return /[\s#]/.test(value) ? `'${value.replace(/'/g, "\\'")}'` : value;
}

function commentLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => `# ${line}`);
}

/** Genera el contenido de `.env.example` a partir de una definición. */
export function renderEnvExample<S extends EnvShape>(definition: EnvDefinition<S>, source?: string): string {
  const lines: string[] = [];
  if (definition.title) {
    lines.push(...commentLines(definition.title));
  }
  lines.push(
    `# Generado por capsur-env-example${source ? ` desde ${source}` : ''}. No editar a mano:`,
    '# cambia los ejemplos en el esquema del servicio y vuelve a generarlo.',
  );
  for (const variable of Object.keys(definition.shape)) {
    const schema = definition.shape[variable] as z.ZodType;
    const description = definition.descriptions[variable] ?? descriptionOf(schema);
    lines.push('');
    if (description) {
      lines.push(...commentLines(description));
    }
    lines.push(`${variable}=${formatValue(definition.examples[variable] ?? '')}`);
  }
  return `${lines.join('\n')}\n`;
}
