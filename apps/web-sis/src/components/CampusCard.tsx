import { Clock, MapPin, Navigation, Phone } from 'lucide-react';
import { googleMapsUrl, institution } from '@/content/institution';

/**
 * Tarjeta de la sede (A25): dirección, enlace «Cómo llegar» a Google Maps (sin
 * iframe: no carga terceros ni rompe la CSP) y central telefónica. El horario
 * solo aparece si está confirmado en src/content/institution.ts.
 */
export function CampusCard() {
  const campus = institution.campus.tacna;
  return (
    <aside
      aria-labelledby="campus-title"
      className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60"
      data-testid="campus-card"
    >
      <h2 id="campus-title" className="flex items-center gap-2.5 text-[1.15rem] font-extrabold text-ink-900">
        <MapPin className="size-6 shrink-0 text-brand-500" strokeWidth={1.75} aria-hidden="true" />
        {campus.label}
      </h2>
      <address className="mt-3 not-italic text-[0.92rem] leading-relaxed text-ink-700">
        {campus.address}
        <br />
        {campus.city}, Perú
      </address>
      <dl className="mt-3 space-y-2 text-[0.9rem] text-ink-700">
        <div className="flex items-center gap-2">
          <dt className="flex items-center gap-2 font-semibold text-ink-900">
            <Phone className="size-4 text-brand-500" aria-hidden="true" />
            Central:
          </dt>
          <dd>
            <a href={`tel:${campus.phoneE164}`} className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700">
              {campus.phoneDisplay}
            </a>
          </dd>
        </div>
        {campus.openingHours && (
          <div className="flex items-center gap-2">
            <dt className="flex items-center gap-2 font-semibold text-ink-900">
              <Clock className="size-4 text-brand-500" aria-hidden="true" />
              Horario:
            </dt>
            <dd>{campus.openingHours}</dd>
          </div>
        )}
      </dl>
      <a
        href={googleMapsUrl(campus.address, campus.city)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-bold text-white transition-colors hover:bg-brand-600"
      >
        <Navigation className="size-4" aria-hidden="true" />
        Cómo llegar
        <span className="sr-only">(abre Google Maps en una pestaña nueva)</span>
      </a>
    </aside>
  );
}
