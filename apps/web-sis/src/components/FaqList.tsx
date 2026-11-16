import { ChevronDown } from 'lucide-react';
import type { FaqItem } from '@/content/faq';

/** Lista de preguntas con <details>/<summary> nativos: teclado y lector de pantalla sin JavaScript. */
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="mt-5 flex flex-col gap-2.5" data-testid="faq">
      {items.map((item) => (
        <details
          key={item.id}
          data-faq-id={item.id}
          className="group rounded-2xl bg-white shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 open:ring-brand-300"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-[0.95rem] font-bold text-ink-900 [&::-webkit-details-marker]:hidden">
            {item.question}
            <ChevronDown
              className="size-5 shrink-0 text-brand-500 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <p className="px-4 pb-4 text-pretty text-[0.9rem] leading-relaxed text-ink-700">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

/** Datos estructurados FAQPage a partir de las mismas preguntas. */
export function faqJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
