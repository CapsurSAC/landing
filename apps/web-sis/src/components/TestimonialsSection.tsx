import { Quote } from 'lucide-react';
import { testimonials as defaultTestimonials, type Testimonial } from '@/content/testimonials';

/**
 * Testimonios de egresados (A12). Oculta mientras src/content/testimonials.ts
 * esté vacío: no se publican testimonios ficticios.
 */
export function TestimonialsSection({ items = defaultTestimonials }: { items?: Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="testimonials-title" className="pb-7 sm:pb-8" data-testid="testimonials">
      <div className="container-x">
        <h2 id="testimonials-title" className="text-2xl leading-tight font-extrabold text-ink-900 sm:text-[1.85rem]">
          Lo que dicen nuestros egresados
        </h2>
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {items.map((t) => (
            <li key={`${t.name}-${t.program}`} className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60">
              <figure>
                <Quote className="size-6 text-cyan-400" aria-hidden="true" />
                <blockquote className="mt-2 text-pretty text-[0.92rem] leading-relaxed text-ink-700">{t.quote}</blockquote>
                <figcaption className="mt-3 text-[0.85rem]">
                  <span className="font-bold text-ink-900">{t.name}</span>
                  <span className="block text-ink-600">
                    {t.program}
                    {t.role ? ` · ${t.role}` : ''}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
