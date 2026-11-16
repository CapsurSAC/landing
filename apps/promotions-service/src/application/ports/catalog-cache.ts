/**
 * Caché de respuestas de catálogo serializables en JSON. Toda implementación
 * debe ser tolerante a fallos: un error de caché nunca rompe una petición.
 */
export interface CatalogCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Borra todas las claves que empiezan por `prefix` (p. ej. tras editar el catálogo). */
  invalidatePrefix(prefix: string): Promise<void>;
}

/** Implementación nula: se usa cuando no hay Redis configurado. */
export class NullCatalogCache implements CatalogCache {
  get<T>(_key: string): Promise<T | null> {
    return Promise.resolve(null);
  }

  set<T>(_key: string, _value: T, _ttlSeconds: number): Promise<void> {
    return Promise.resolve();
  }

  invalidatePrefix(_prefix: string): Promise<void> {
    return Promise.resolve();
  }
}
