import { RUTA_FOTOS } from '../data/programas.js';
import { RUTA_LOGOS } from '../data/instituciones.js';
import { IconoCheck, IconoFlecha } from './Iconos.jsx';

/** Formulario del inicio, con el área ya marcada si el programa tiene una sola. */
const urlFormulario = (area) => (area ? `/?area=${area}#formulario` : '/#formulario');

/**
 * Una fila por institución con el detalle de su oferta, tal como viene en el
 * PDF de CAPSUR. "Me interesa" lleva al formulario del inicio.
 */
export default function Programas({ programas }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 xl:gap-3">
      {programas.map((p) => (
        <li key={p.id} className="programa">
          <div className="programa__foto">
            <img
              src={`${RUTA_FOTOS}/${p.foto}`}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover object-[50%_25%]"
            />
          </div>

          <div className="programa__marca">
            <img
              src={`${RUTA_LOGOS}/${p.logo}`}
              alt={p.institucion}
              loading="lazy"
              decoding="async"
              className="h-12 w-auto max-w-[10rem] object-contain xl:h-14"
            />
            {p.sello && <p className="programa__sello">{p.sello}</p>}
          </div>

          <div className="programa__texto">
            <h2 className="text-[16px] leading-snug font-extrabold text-navy-900">{p.titulo}</h2>
            <p className="mt-1 text-[13px] leading-snug text-gris-texto">{p.descripcion}</p>
          </div>

          <ul className={`programa__puntos ${p.enColumnas ? 'grid grid-cols-2 gap-x-4' : ''}`}>
            {p.puntos.map(({ texto, proximamente }) => (
              <li key={texto} className="flex items-start gap-2">
                <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                  <IconoCheck className="size-2.5" />
                </span>
                <span>
                  {texto}
                  {proximamente && <span className="programa__pronto">Próximamente</span>}
                </span>
              </li>
            ))}
          </ul>

          <a
            href={urlFormulario(p.area)}
            className="programa__boton"
            data-medir={`Me interesa: ${p.institucion}`}
          >
            <span>
              Me interesa <span className="block">{p.institucion}</span>
            </span>
            <IconoFlecha className="size-4 shrink-0" />
          </a>
        </li>
      ))}
    </ul>
  );
}
