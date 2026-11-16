import { type Brand } from '../../domain';

export interface BrandRepository {
  /** Devuelve la marca activa con ese id o `null` si no existe o está inactiva. */
  findActiveById(id: string): Promise<Brand | null>;
}
