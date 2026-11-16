import { phoneCountries } from '@/lib/config';
import type { LeadFilters, LeadRow } from '@/server/db';

/** Filtros del panel a partir de la URL (?q=&promocion=&carrera=&estado=&desde=&hasta=). */
export function filtersFrom(params: Record<string, string | string[] | undefined>): LeadFilters {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.slice(0, 120) ?? '';
  };
  return {
    q: one('q'),
    promotionId: one('promocion'),
    specialty: one('carrera'),
    status: one('estado'),
    whatsapp: one('whatsapp'),
    from: one('desde'),
    to: one('hasta'),
  };
}

const LIMA_DATE_TIME = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatLimaDateTime(iso: string): { date: string; time: string } {
  const parts = Object.fromEntries(LIMA_DATE_TIME.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function dialCode(country: string): string {
  return phoneCountries.find((c) => c.code === country)?.dial ?? '';
}

/** Número completo para wa.me (solo dígitos). */
export function whatsappDigits(lead: Pick<LeadRow, 'phoneCountry' | 'phone'>): string {
  return `${dialCode(lead.phoneCountry)}${lead.phone}`.replace(/\D/g, '');
}

/** De dónde vino: utm_source, si no el dominio de referencia, si no «directo». */
export function leadOrigin(lead: Pick<LeadRow, 'utmSource' | 'utmCampaign' | 'referrer'>): string {
  if (lead.utmSource) return lead.utmCampaign ? `${lead.utmSource} · ${lead.utmCampaign}` : lead.utmSource;
  if (lead.referrer) {
    try {
      return new URL(lead.referrer).hostname.replace(/^www\./, '');
    } catch {
      return lead.referrer.slice(0, 40);
    }
  }
  return 'directo';
}

/** Celda CSV segura: comillas escapadas y sin fórmulas (=, +, -, @) que Excel ejecutaría. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
