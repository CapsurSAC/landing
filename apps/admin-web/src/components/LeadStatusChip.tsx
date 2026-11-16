import type { LeadStatus } from '@capsur/api-contracts';
import { LEAD_STATUS } from '@/lib/labels';
import { Chip } from './ui';

export function LeadStatusChip({ status }: { status: LeadStatus }) {
  const { label, tone } = LEAD_STATUS[status];
  return <Chip tone={tone}>{label}</Chip>;
}

/** Enlace wa.me a partir de un teléfono E.164 (o `null` si no hay número). */
export function waLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}
