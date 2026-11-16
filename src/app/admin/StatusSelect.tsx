'use client';

import { useRef } from 'react';
import type { LeadStatus } from '@/server/db';
import { setLeadStatus } from './actions';

const LABELS: Record<LeadStatus, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  matriculado: 'Matriculado',
  descartado: 'Descartado',
};

const COLORS: Record<LeadStatus, string> = {
  nuevo: 'bg-cyan-200/60 text-brand-700',
  contactado: 'bg-mist-100 text-ink-700',
  matriculado: 'bg-wa-500/15 text-wa-700',
  descartado: 'bg-danger-50 text-danger-600',
};

/** Estado del lead; se guarda al elegir, sin botón. */
export function StatusSelect({ id, status, name }: { id: number; status: LeadStatus; name: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setLeadStatus}>
      <input type="hidden" name="id" value={id} />
      <label className="visually-hidden" htmlFor={`status-${id}`}>
        Estado de {name}
      </label>
      <select
        id={`status-${id}`}
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className={`cursor-pointer rounded-full border-0 px-3 py-1 text-[0.8rem] font-bold ${COLORS[status]}`}
      >
        {(Object.keys(LABELS) as LeadStatus[]).map((s) => (
          <option key={s} value={s}>
            {LABELS[s]}
          </option>
        ))}
      </select>
    </form>
  );
}
