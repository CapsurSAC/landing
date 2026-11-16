/** Profundidad de colas para el resumen de integraciones (A27); se implementa con `checkQueue`. */
export interface QueueInspector {
  stats(queue: string): Promise<{ messageCount: number; consumerCount: number }>;
}
