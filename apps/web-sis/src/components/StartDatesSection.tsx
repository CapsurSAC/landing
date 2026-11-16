import type { Specialty } from '@capsur/api-contracts';
import { BellRing, CalendarDays } from 'lucide-react';
import { startDates as defaultStartDates, type StartDate } from '@/content/start-dates';
import { siteConfig } from '@/lib/config';
import { formatLongDate } from '@/lib/format';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

interface StartDatesSectionProps {
  specialties: Specialty[];
  /** Inyectable para pruebas; por defecto, src/content/start-dates.ts. */
  dates?: StartDate[];
}

export function reminderMessage(specialtyName: string, dateLabel: string): string {
  return `Hola. Quiero que me avisen del inicio de ${specialtyName} (${dateLabel}). Lo vi en la web de ${siteConfig.brandName}.`;
}

/**
 * Próximos inicios (A23). Se oculta mientras src/content/start-dates.ts esté
 * vacío. «Avísame» abre WhatsApp con un mensaje ya escrito; el recordatorio
 * por plantilla lo gestiona el equipo desde Chatwoot.
 */
export function StartDatesSection({ specialties, dates = defaultStartDates }: StartDatesSectionProps) {
  const items = dates
    .map((d) => ({ ...d, specialty: specialties.find((s) => s.id === d.specialtyId) }))
    .filter((d): d is StartDate & { specialty: Specialty } => Boolean(d.specialty))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (items.length === 0) return null;

  return (
    <section id="inicios" aria-labelledby="start-dates-title" className="scroll-mt-20 pb-7 sm:pb-8" data-testid="start-dates">
      <div className="container-x">
        <h2 id="start-dates-title" className="flex items-center gap-3 text-2xl leading-tight font-extrabold text-ink-900 sm:text-[1.85rem]">
          <CalendarDays className="size-8 shrink-0 text-cyan-400" strokeWidth={1.75} aria-hidden="true" />
          Próximos inicios
        </h2>
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {items.map((item) => {
            const dateLabel = formatLongDate(item.date);
            const name = item.specialty.shortName ?? item.specialty.name;
            return (
              <li
                key={`${item.specialtyId}-${item.date}`}
                className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60"
              >
                <p className="text-[1.02rem] font-extrabold leading-snug text-ink-900">{name}</p>
                <p className="text-[0.9rem] text-ink-700">
                  Inicio: <time dateTime={item.date}>{dateLabel}</time>
                </p>
                {item.note && <p className="text-[0.8rem] text-ink-600">{item.note}</p>}
                <a
                  href={buildWhatsAppUrl(siteConfig.whatsappNumber, reminderMessage(name, dateLabel))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto inline-flex min-h-10 w-fit items-center gap-2 rounded-full border border-brand-500 px-4 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-500 hover:text-white"
                >
                  <BellRing className="size-4" aria-hidden="true" />
                  Avísame
                  <span className="sr-only">del inicio de {name} por WhatsApp</span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
