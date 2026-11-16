import type { Promotion, Specialty } from '@capsur/api-contracts';
import { Check } from 'lucide-react';
import { formatLongDate } from '@/lib/format';
import { eligibleSpecialties, TRACK_LABEL } from '@/lib/specialty-selection';

interface PromotionComparisonTableProps {
  promotions: Promotion[];
  specialties: Specialty[];
}

/**
 * Comparador accesible de promociones (A26). Tabla nativa con <caption>,
 * encabezados de fila y de columna; todo sale del catálogo (sin datos fijos).
 */
export function PromotionComparisonTable({ promotions, specialties }: PromotionComparisonTableProps) {
  const rows: Array<{ label: string; cell: (p: Promotion) => React.ReactNode }> = [
    { label: 'Precio', cell: (p) => <span className="text-lg font-extrabold text-ink-900">{p.headline}</span> },
    { label: 'Especialidades incluidas', cell: (p) => `${p.bundle.specialtiesIncluded} · ${p.bundle.label}` },
    { label: 'Tipo de especialidad', cell: (p) => p.bundle.allowedTracks.map((t) => TRACK_LABEL[t]).join(' o ') },
    {
      label: 'Puedes elegir entre',
      cell: (p) => (
        <ul className="space-y-1">
          {eligibleSpecialties(p, specialties).map((s) => (
            <li key={s.id} className="flex items-start gap-1.5">
              <Check className="mt-0.5 size-4 shrink-0 text-wa-600" aria-hidden="true" />
              <span>{s.shortName ?? s.name}</span>
            </li>
          ))}
        </ul>
      ),
    },
    { label: 'Modalidad', cell: () => '100% virtual' },
    { label: 'Vigencia', cell: (p) => (p.validUntil ? `Hasta el ${formatLongDate(p.validUntil)}` : 'Consulta con un asesor') },
  ];

  return (
    // Región enfocable: en móvil la tabla se desplaza en horizontal y debe poder recorrerse con teclado.
    <div
      className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-mist-200"
      data-testid="promotion-comparison"
      role="region"
      aria-label="Comparación de promociones"
      tabIndex={0}
    >
      <table className="w-full min-w-[34rem] border-collapse bg-white text-left text-[0.85rem] text-ink-700">
        <caption className="sr-only">Comparación de promociones: precio, especialidades incluidas, modalidad y vigencia</caption>
        <thead>
          <tr className="bg-mist-50">
            <td className="w-[22%] p-3" />
            {promotions.map((p) => (
              <th key={p.id} scope="col" className="p-3 text-[0.95rem] font-extrabold text-ink-900">
                {p.name}
                {p.featured && (
                  <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 align-middle text-[0.7rem] font-bold text-white">Destacada</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-mist-200 align-top">
              <th scope="row" className="p-3 font-bold text-ink-900">
                {row.label}
              </th>
              {promotions.map((p) => (
                <td key={p.id} className="p-3">
                  {row.cell(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
