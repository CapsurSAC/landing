import { NUMBER, percent } from '@/lib/labels';

/*
 * Gráficos sin librerías: SVG con atributos de presentación (no `style`
 * en línea, para respetar la CSP) y siempre acompañados del dato en texto.
 */

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

/** Embudo en barras horizontales con número y % respecto al paso anterior. */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <div className="table-wrap">
      <table className="table" data-testid="funnel">
        <caption className="visually-hidden">Embudo de conversión: personas por paso y porcentaje respecto al paso anterior</caption>
        <thead>
          <tr>
            <th scope="col">Paso</th>
            <th scope="col" className="w-1/2">
              <span className="visually-hidden">Barra</span>
            </th>
            <th scope="col" className="num">
              Cantidad
            </th>
            <th scope="col" className="num">
              % del paso anterior
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => {
            const prev = i > 0 ? steps[i - 1]!.count : null;
            const width = (step.count / max) * 100;
            return (
              <tr key={step.key}>
                <th scope="row">
                  {step.label}
                </th>
                <td className="align-middle">
                  <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-5 w-full" aria-hidden="true" focusable="false">
                    <rect x="0" y="0" width="100" height="10" rx="1.5" className="fill-mist-100" />
                    <rect x="0" y="0" width={Math.max(width, step.count > 0 ? 0.8 : 0)} height="10" rx="1.5" className={i < 5 ? 'fill-brand-500' : 'fill-cyan-400'} />
                  </svg>
                </td>
                <td className="num font-semibold text-ink-900">{NUMBER.format(step.count)}</td>
                <td className="num">{prev === null ? '—' : percent(step.count, prev)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Columnas por día (leads y duplicados). */
export function DailyColumns({ days }: { days: { date: string; leads: number; duplicates: number }[] }) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.leads));
  const width = 100 / days.length;
  const total = days.reduce((acc, d) => acc + d.leads, 0);
  return (
    <figure>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={`Leads por día: ${NUMBER.format(total)} en total, máximo ${NUMBER.format(max)} en un día`}
      >
        {days.map((d, i) => {
          const h = (d.leads / max) * 38;
          const dupH = (Math.min(d.duplicates, d.leads) / max) * 38;
          return (
            <g key={d.date}>
              <title>{`${d.date}: ${d.leads} leads, ${d.duplicates} duplicados`}</title>
              <rect x={i * width + width * 0.15} y={40 - h} width={width * 0.7} height={h} className="fill-brand-500" />
              <rect x={i * width + width * 0.15} y={40 - dupH} width={width * 0.7} height={dupH} className="fill-cyan-300" />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
            <rect width="10" height="10" className="fill-brand-500" />
          </svg>
          Leads
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
            <rect width="10" height="10" className="fill-cyan-300" />
          </svg>
          Duplicados
        </span>
        <span>
          {days[0]!.date} → {days[days.length - 1]!.date}
        </span>
      </figcaption>
    </figure>
  );
}
