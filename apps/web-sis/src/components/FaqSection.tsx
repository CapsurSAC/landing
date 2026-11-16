import { CircleHelp } from 'lucide-react';
import { CampusCard } from '@/components/CampusCard';
import { FaqList, faqJsonLd } from '@/components/FaqList';
import { FaqTracker } from '@/components/FaqTracker';
import { JsonLd } from '@/components/JsonLd';
import { faqItems } from '@/content/faq';

/**
 * Preguntas frecuentes con <details> nativo (A11): accesible sin JavaScript y
 * con JSON-LD FAQPage. A la derecha, la tarjeta de la sede (A25).
 */
export function FaqSection() {
  return (
    <section id="preguntas" aria-labelledby="faq-title" className="scroll-mt-20 pt-2 pb-7 sm:pb-8">
      <div className="container-x grid gap-6 lg:grid-cols-[1.45fr_1fr] lg:items-start">
        <div className="min-w-0">
          <h2 id="faq-title" className="flex items-center gap-3 text-balance text-2xl leading-tight font-extrabold text-ink-900 sm:text-[1.85rem]">
            <CircleHelp className="size-8 shrink-0 text-cyan-400" strokeWidth={1.75} aria-hidden="true" />
            Preguntas frecuentes
          </h2>
          {faqItems.length > 0 && (
            <FaqTracker>
              <FaqList items={faqItems} />
            </FaqTracker>
          )}
        </div>
        <CampusCard />
      </div>
      {faqItems.length > 0 && <JsonLd data={faqJsonLd(faqItems)} />}
    </section>
  );
}
