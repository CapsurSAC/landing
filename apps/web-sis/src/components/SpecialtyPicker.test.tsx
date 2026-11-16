import type { Promotion } from '@capsur/api-contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { fallbackPromotions, fallbackSpecialties } from '@/lib/fallback-catalog';
import { SpecialtyPicker } from './SpecialtyPicker';

function Harness({ promotion }: { promotion: Promotion }) {
  const [ids, setIds] = useState<string[]>([]);
  return (
    <>
      <SpecialtyPicker promotion={promotion} specialties={fallbackSpecialties} selectedIds={ids} onChange={setIds} />
      <output data-testid="value">{ids.join(',')}</output>
    </>
  );
}

const byId = (id: string) => fallbackPromotions.find((p) => p.id === id)!;

describe('SpecialtyPicker (A3)', () => {
  test('promoción de 1 especialidad: radios con «Lo decido con un asesor» marcado por defecto', async () => {
    const user = userEvent.setup();
    render(<Harness promotion={byId('con-ia')} />);
    const radios = screen.getAllByRole('radio');
    // 3 especialidades IA + «Lo decido con un asesor»
    expect(radios).toHaveLength(4);
    expect(screen.getByRole('radio', { name: /Lo decido con un asesor/ })).toHaveProperty('checked', true);
    expect(screen.queryByRole('radio', { name: /Computación/ })).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Desarrollo Web con IA' }));
    expect(screen.getByTestId('value').textContent).toBe('desarrollo-web-con-ia');
    await user.click(screen.getByRole('radio', { name: 'Ciberseguridad 4.0' }));
    expect(screen.getByTestId('value').textContent).toBe('ciberseguridad-4-0');
    await user.click(screen.getByRole('radio', { name: /Lo decido con un asesor/ }));
    expect(screen.getByTestId('value').textContent).toBe('');
  });

  test('promoción de 2: casillas con máximo y las demás se deshabilitan al llegar al tope', async () => {
    const user = userEvent.setup();
    render(<Harness promotion={byId('dos-por-uno')} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(fallbackSpecialties.length + 1);
    await user.click(screen.getByRole('checkbox', { name: 'Desarrollo Web con IA' }));
    await user.click(screen.getByRole('checkbox', { name: 'Computación e Informática' }));
    expect(screen.getByTestId('value').textContent).toBe('desarrollo-web-con-ia,computacion-e-informatica');
    expect(screen.getByRole('checkbox', { name: 'Ciberseguridad 4.0' })).toHaveProperty('disabled', true);
    expect(screen.getByText(/elegiste 2 de 2/)).toBeTruthy();
  });

  test('se puede operar con teclado (espacio sobre la casilla enfocada)', async () => {
    const user = userEvent.setup();
    render(<Harness promotion={byId('pack-ia-pro')} />);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Desarrollo Web con IA' }));
    await user.keyboard(' ');
    expect(screen.getByTestId('value').textContent).toBe('desarrollo-web-con-ia');
  });
});
