export interface ProcessedEventRepository {
  exists(eventId: string): Promise<boolean>;
  /** Marca un evento como procesado sin tocar ningún lead (p. ej. lead inexistente). */
  record(eventId: string, name: string, processedAt: Date): Promise<void>;
}

export const PROCESSED_EVENT_REPOSITORY = Symbol('PROCESSED_EVENT_REPOSITORY');
