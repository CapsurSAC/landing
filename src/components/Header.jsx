import LogoCapsur from './LogoCapsur.jsx';
import { CATEGORIAS, urlProgramas } from '../data/programas.js';

/**
 * Logo y los cuatro tipos de oferta. Cada uno abre la página de programas
 * filtrada por esa categoría; `actual` marca el que se está viendo allí.
 * Fuera del inicio (`conInicio`) se suma un primer enlace para volver.
 */
export default function Header({ actual = null, conInicio = false }) {
  const enlaces = conInicio ? [{ id: 'inicio', nombre: 'Inicio', url: '/' }, ...CATEGORIAS] : CATEGORIAS;

  return (
    <header className="shrink-0 bg-white">
      <div className="mx-auto flex max-w-[100rem] flex-col items-center gap-2 px-5 py-3 md:flex-row md:justify-between md:gap-8 md:px-8">
        <a href="/" aria-label="Grupo CAPSUR, ir al inicio">
          <LogoCapsur />
        </a>

        <nav aria-label="Programas por tipo de formación">
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] font-bold text-navy-900 sm:gap-x-3 sm:text-[15px]">
            {enlaces.map(({ id, nombre, url }, i) => (
              <li key={id} className="flex items-center gap-x-2 sm:gap-x-3">
                {i > 0 && (
                  <span aria-hidden="true" className="hidden text-slate-300 sm:inline">
                    |
                  </span>
                )}
                <a
                  href={url ?? urlProgramas(id)}
                  aria-current={actual === id ? 'page' : undefined}
                  className="enlace-menu"
                  data-medir={`Menú: ${nombre}`}
                >
                  {nombre}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
