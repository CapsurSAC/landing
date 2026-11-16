import type { FieldError } from './problem-exception';

/** Constructor de una clase de error de dominio (admite clases abstractas). */
export type ErrorClass<E extends Error = Error> = abstract new (...args: never[]) => E;

/** Cómo se traduce un error de dominio concreto a problem-details. */
export interface DomainErrorMapping<E extends Error = Error> {
  /** Código HTTP. */
  status: number;
  /** Título; por defecto el genérico del código HTTP. */
  title?: string;
  /**
   * Código de máquina. Por defecto, la propiedad `code` del error si es un
   * string; si no, el código genérico del status.
   */
  code?: string | ((error: E) => string | undefined);
  /** Detalle para el usuario. Por defecto, `error.message`. Usa `null` para omitirlo. */
  detail?: string | null | ((error: E) => string | undefined);
  /** Cabeceras extra (p. ej. `Retry-After`). */
  headers?: (error: E) => Record<string, string>;
  /** Errores por campo (p. ej. teléfono inválido → `path: "phone"`). */
  errors?: (error: E) => FieldError[];
}

/** Entrada ya «borrada» de tipo, lista para registrarse. */
export interface DomainErrorEntry {
  readonly error: ErrorClass;
  readonly mapping: DomainErrorMapping;
}

/**
 * Asocia una clase de error de dominio con su traducción HTTP conservando el
 * tipado del error en los callbacks.
 *
 * @example
 * mapDomainError(CatalogUnavailableError, { status: 503, headers: (e) => ({ 'Retry-After': String(e.retryAfterSeconds) }) })
 */
export function mapDomainError<E extends Error>(error: ErrorClass<E>, mapping: DomainErrorMapping<E>): DomainErrorEntry {
  // El registro solo invoca los callbacks con instancias de `error`, así que el
  // estrechamiento de E a Error es seguro.
  return { error, mapping: mapping as unknown as DomainErrorMapping };
}

/**
 * Registro de traducciones error de dominio → status/código. Resuelve por la
 * cadena de prototipos, de modo que gana la clase más específica registrada.
 */
export class DomainErrorRegistry {
  private readonly mappings = new Map<ErrorClass, DomainErrorMapping>();

  constructor(entries: Iterable<DomainErrorEntry> = []) {
    this.registerAll(entries);
  }

  /** Registra (o reemplaza) la traducción de una clase de error. */
  register<E extends Error>(error: ErrorClass<E>, mapping: DomainErrorMapping<E>): this {
    const entry = mapDomainError(error, mapping);
    this.mappings.set(entry.error, entry.mapping);
    return this;
  }

  /** Registra varias entradas creadas con {@link mapDomainError}. */
  registerAll(entries: Iterable<DomainErrorEntry>): this {
    for (const entry of entries) {
      this.mappings.set(entry.error, entry.mapping);
    }
    return this;
  }

  /** Busca la traducción más específica para `error`, o `undefined`. */
  resolve(error: unknown): DomainErrorMapping | undefined {
    if (!(error instanceof Error)) {
      return undefined;
    }
    let proto: unknown = Object.getPrototypeOf(error);
    while (proto && proto !== Object.prototype) {
      const ctor = (proto as { constructor?: unknown }).constructor;
      const mapping = typeof ctor === 'function' ? this.mappings.get(ctor as ErrorClass) : undefined;
      if (mapping) {
        return mapping;
      }
      proto = Object.getPrototypeOf(proto);
    }
    return undefined;
  }

  /** Vacía el registro (útil en pruebas). */
  clear(): void {
    this.mappings.clear();
  }
}

/** Registro global que usa `ProblemDetailsFilter` cuando no se le inyecta otro. */
export const defaultDomainErrorRegistry = new DomainErrorRegistry();

/**
 * Registra traducciones en el registro global. Llamar una vez al arrancar el
 * servicio (p. ej. en `main.ts` o en el constructor del módulo raíz).
 *
 * @example
 * registerDomainErrors([
 *   mapDomainError(LeadNotFoundError, { status: 404, title: 'Solicitud no encontrada' }),
 *   mapDomainError(PromotionNotAvailableError, { status: 422 }),
 * ]);
 */
export function registerDomainErrors(entries: Iterable<DomainErrorEntry>): void {
  defaultDomainErrorRegistry.registerAll(entries);
}
