'use client';

import type { Promotion, Specialty } from '@capsur/api-contracts';
import { Headset } from 'lucide-react';
import { useId } from 'react';
import { eligibleSpecialties, toggleSpecialty } from '@/lib/specialty-selection';

interface SpecialtyPickerProps {
  promotion: Promotion;
  specialties: Specialty[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  locked?: boolean;
  errorMessage?: string | null;
}

/**
 * Selector de especialidades dentro de la promoción (A3). Con una sola
 * especialidad incluida se comporta como un grupo de radios; con más, como
 * casillas con máximo. «Lo decido con un asesor» equivale a no elegir ninguna
 * (se envía `specialtyIds: []`). Controles nativos ocultos visualmente: el
 * teclado y los lectores de pantalla funcionan sin ARIA adicional.
 */
export function SpecialtyPicker({ promotion, specialties, selectedIds, onChange, locked = false, errorMessage }: SpecialtyPickerProps) {
  const id = useId();
  const max = promotion.bundle.specialtiesIncluded;
  const options = eligibleSpecialties(promotion, specialties);
  const single = max <= 1;
  const decideLater = selectedIds.length === 0;
  const name = `${id}-specialty`;

  if (options.length === 0) return null;

  const hint = single
    ? 'Incluye 1 especialidad.'
    : `Incluye hasta ${max} especialidades${selectedIds.length > 0 ? ` (elegiste ${selectedIds.length} de ${max})` : ''}.`;

  return (
    <fieldset
      className="mt-3 min-w-0"
      aria-describedby={`${id}-hint${errorMessage ? ` ${id}-error` : ''}`}
      disabled={locked}
      data-testid="specialty-picker"
    >
      <legend className="text-[0.9rem] font-bold text-ink-900">Elige tu especialidad</legend>
      <p id={`${id}-hint`} className="mt-0.5 text-[0.8rem] text-ink-600" aria-live="polite">
        {hint}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="choice-chip">
          <input
            type={single ? 'radio' : 'checkbox'}
            name={single ? name : undefined}
            checked={decideLater}
            onChange={() => onChange([])}
            className="sr-only"
            data-testid="specialty-decide-later"
          />
          <Headset className="size-4" aria-hidden="true" />
          Lo decido con un asesor
        </label>
        {options.map((s) => {
          const checked = selectedIds.includes(s.id);
          const full = !single && !checked && selectedIds.length >= max;
          return (
            <label key={s.id} className="choice-chip">
              <input
                type={single ? 'radio' : 'checkbox'}
                name={single ? name : undefined}
                value={s.id}
                checked={checked}
                disabled={full}
                onChange={() => onChange(toggleSpecialty(selectedIds, s.id, max))}
                className="sr-only"
                data-testid={`specialty-${s.id}`}
              />
              {s.shortName ?? s.name}
            </label>
          );
        })}
      </div>
      {errorMessage && (
        <p id={`${id}-error`} className="error-msg">
          <span aria-hidden="true">⚠</span>
          {errorMessage}
        </p>
      )}
    </fieldset>
  );
}
