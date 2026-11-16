import { daysUntil, formatDate } from '@/lib/dates';
import { Chip } from './ui';

/** Plazo legal restante hasta `responseDueBy`; resalta los vencidos. */
export function DueChip({ dueBy, closed, now = new Date() }: { dueBy: string; closed: boolean; now?: Date }) {
  if (closed) return <Chip>Atendida</Chip>;
  const { days, overdue } = daysUntil(dueBy, now);
  if (overdue) {
    const ago = Math.max(0, -days);
    return <Chip tone="danger">{ago === 0 ? 'Vencida hoy' : `Vencida hace ${ago} ${ago === 1 ? 'día' : 'días'}`}</Chip>;
  }
  if (days === 0) return <Chip tone="warning">Vence hoy</Chip>;
  return (
    <Chip tone={days <= 3 ? 'warning' : 'neutral'}>
      {days} {days === 1 ? 'día' : 'días'}
      <span className="visually-hidden"> (vence el {formatDate(dueBy)})</span>
    </Chip>
  );
}
