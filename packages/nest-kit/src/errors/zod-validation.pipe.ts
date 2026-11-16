import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationException, type FieldError } from './problem-exception';

/** Ruta que se usa cuando el error afecta al valor completo y no a un campo. */
export const ROOT_PATH = '(raíz)';

/** Convierte los issues de Zod en errores por campo para problem-details. */
export function zodIssuesToFieldErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): FieldError[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.') || ROOT_PATH,
    message: issue.message,
  }));
}

/**
 * Valida (y transforma) la entrada con un esquema Zod del contrato. Si falla,
 * lanza {@link ValidationException}: 400 problem-details con
 * `errors: [{ path, message }]`.
 *
 * @example
 * create(@Body(new ZodValidationPipe(CreateLeadRequestSchema)) body: CreateLeadRequest) {}
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new ValidationException(zodIssuesToFieldErrors(result.error.issues));
  }
}
