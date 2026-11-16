import Link from 'next/link';
import { NUMBER } from '@/lib/labels';

/** Paginación por enlaces (funciona sin JavaScript y conserva los filtros en la URL). */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-ink-600">
      <p>
        Mostrando <strong className="text-ink-900">{NUMBER.format(start)}</strong>–
        <strong className="text-ink-900">{NUMBER.format(end)}</strong> de{' '}
        <strong className="text-ink-900">{NUMBER.format(total)}</strong>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link className="btn btn-secondary" href={hrefFor(page - 1)} rel="prev">
            ← Anterior
          </Link>
        ) : (
          <span className="btn btn-secondary opacity-50" aria-disabled="true">
            ← Anterior
          </span>
        )}
        <span aria-current="page">
          Página {NUMBER.format(page)} de {NUMBER.format(pages)}
        </span>
        {page < pages ? (
          <Link className="btn btn-secondary" href={hrefFor(page + 1)} rel="next">
            Siguiente →
          </Link>
        ) : (
          <span className="btn btn-secondary opacity-50" aria-disabled="true">
            Siguiente →
          </span>
        )}
      </div>
    </nav>
  );
}
