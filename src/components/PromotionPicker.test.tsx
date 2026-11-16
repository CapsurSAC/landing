import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fallbackPromotions } from '@/lib/fallback-catalog';
import { PromotionPicker } from './PromotionPicker';

function Harness({ onSelect }: { onSelect?: (id: string) => void }) {
  const [selected, setSelected] = useState<string | null>('con-ia');
  return (
    <PromotionPicker
      promotions={fallbackPromotions}
      selectedId={selected}
      onSelect={(id) => {
        setSelected(id);
        onSelect?.(id);
      }}
    />
  );
}

describe('PromotionPicker', () => {
  test('expone un radiogroup con una sola opción marcada y foco itinerante', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Promoción' });
    const radios = screen.getAllByRole('radio');
    expect(group).toBeTruthy();
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(screen.getByTestId('promo-con-ia').tabIndex).toBe(0);
    expect(screen.getByTestId('promo-dos-por-uno').tabIndex).toBe(-1);
  });

  test('las flechas mueven la selección y el foco, con vuelta circular', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    screen.getByTestId('promo-con-ia').focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('promo-pack-ia-pro').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(screen.getByTestId('promo-pack-ia-pro'));

    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('promo-dos-por-uno').getAttribute('aria-checked')).toBe('true');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('promo-pack-ia-pro').getAttribute('aria-checked')).toBe('true');
    expect(onSelect).toHaveBeenLastCalledWith('pack-ia-pro');
  });

  test('clic y Enter seleccionan', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('promo-dos-por-uno'));
    expect(screen.getByTestId('promo-dos-por-uno').getAttribute('aria-checked')).toBe('true');
    screen.getByTestId('promo-pack-ia-pro').focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('promo-pack-ia-pro').getAttribute('aria-checked')).toBe('true');
  });

  test('bloqueado tras registrar: las demás opciones quedan deshabilitadas', () => {
    render(<PromotionPicker promotions={fallbackPromotions} selectedId="con-ia" onSelect={() => undefined} locked />);
    expect((screen.getByTestId('promo-dos-por-uno') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('promo-con-ia') as HTMLButtonElement).disabled).toBe(false);
  });

  test('muestra «Válida hasta el …» solo si la promoción tiene validUntil (A13)', () => {
    const promotions = fallbackPromotions.map((p) => (p.id === 'con-ia' ? { ...p, validUntil: '2026-11-30T23:59:59.000-05:00' } : p));
    render(<PromotionPicker promotions={promotions} selectedId="con-ia" onSelect={() => undefined} />);
    expect(screen.getByTestId('promo-valid-until-con-ia').textContent).toBe('Válida hasta el 30 de noviembre');
    expect(screen.queryByTestId('promo-valid-until-dos-por-uno')).toBeNull();
  });
});
