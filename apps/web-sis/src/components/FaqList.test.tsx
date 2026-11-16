import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { ADVISOR_ANSWER, faqItems } from '@/content/faq';
import { StartDatesSection } from './StartDatesSection';
import { TestimonialsSection } from './TestimonialsSection';
import { FaqList, faqJsonLd } from './FaqList';
import { fallbackSpecialties } from '@/lib/fallback-catalog';

describe('FAQ (A11)', () => {
  test('usa <details>/<summary> nativos (la activación por teclado la cubre e2e en navegador real)', async () => {
    const user = userEvent.setup();
    const { container } = render(<FaqList items={faqItems} />);
    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(faqItems.length);
    const first = details[0]!;
    expect(first.open).toBe(false);
    await user.click(first.querySelector('summary')!);
    expect(first.open).toBe(true);
    expect(screen.getByText(faqItems[0]!.answer)).toBeTruthy();
  });

  test('las preguntas sin dato verificable derivan a un asesor', () => {
    const pagos = faqItems.find((f) => f.id === 'pagos');
    const inicio = faqItems.find((f) => f.id === 'inicio');
    expect(pagos?.answer).toBe(ADVISOR_ANSWER);
    expect(inicio?.answer).toBe(ADVISOR_ANSWER);
  });

  test('genera JSON-LD FAQPage con las mismas preguntas', () => {
    const ld = faqJsonLd(faqItems);
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(faqItems.length);
    expect(ld.mainEntity[0]?.acceptedAnswer.text).toBe(faqItems[0]!.answer);
  });
});

describe('secciones alimentadas por contenido vacío', () => {
  test('testimonios y próximos inicios se ocultan si no hay datos', () => {
    const { container } = render(
      <>
        <TestimonialsSection items={[]} />
        <StartDatesSection specialties={fallbackSpecialties} dates={[]} />
      </>,
    );
    expect(container.innerHTML).toBe('');
  });

  test('próximos inicios: botón «Avísame» abre WhatsApp con mensaje prellenado (A23)', () => {
    render(<StartDatesSection specialties={fallbackSpecialties} dates={[{ specialtyId: 'ciberseguridad-4-0', date: '2027-01-15' }]} />);
    const link = screen.getByRole('link', { name: /Avísame/ });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain('Ciberseguridad 4.0 (15 de enero de 2027)');
  });
});
