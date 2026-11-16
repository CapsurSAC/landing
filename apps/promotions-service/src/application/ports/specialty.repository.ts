import { type Specialty, type SpecialtyTrack } from '../../domain';

export interface SpecialtyRepository {
  /**
   * Especialidades activas de la marca, opcionalmente filtradas por línea,
   * ordenadas por `sortOrder` e id.
   */
  findActiveByBrand(brandId: string, track?: SpecialtyTrack): Promise<Specialty[]>;

  /** Todas las especialidades de la marca (incluidas inactivas), para el panel. */
  listByBrand(brandId: string): Promise<Specialty[]>;

  /** Reemplaza los campos editables. `SpecialtyNotFoundError` si no existe. */
  update(specialty: Specialty): Promise<Specialty>;
}
