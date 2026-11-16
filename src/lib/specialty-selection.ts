/**
 * Reglas del selector de especialidades dentro de una promoción (A3). Puras
 * para poder probarlas sin navegador.
 */
import type { Promotion, Specialty } from '@capsur/api-contracts';

/** Especialidades que admite la promoción (por tipo permitido), en orden de catálogo. */
export function eligibleSpecialties(promotion: Pick<Promotion, 'bundle'>, specialties: Specialty[]): Specialty[] {
  const allowed = new Set<string>(promotion.bundle.allowedTracks);
  return specialties.filter((s) => allowed.has(s.track)).sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Alterna una especialidad respetando el máximo. Con máximo 1 se comporta
 * como un radio (reemplaza la elección). Devuelve la selección sin cambios si
 * ya se alcanzó el máximo.
 */
export function toggleSpecialty(selected: string[], id: string, max: number): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  if (max <= 1) return [id];
  if (selected.length >= max) return selected;
  return [...selected, id];
}

/** Descarta elecciones que ya no son válidas tras cambiar de promoción. */
export function reconcileSelection(selected: string[], eligible: Specialty[], max: number): string[] {
  const ids = new Set(eligible.map((s) => s.id));
  return selected.filter((id) => ids.has(id)).slice(0, Math.max(0, max));
}

export const TRACK_LABEL: Record<Specialty['track'], string> = {
  ia: 'Con IA',
  tradicional: 'Tradicional',
};
