import { TESTIMONIOS } from '../data/contenido.js';

/**
 * Testimonios de egresados (src/data/contenido.js), solo con su permiso.
 * Sin testimonios no se pinta nada.
 */
export default function Testimonios() {
  if (!TESTIMONIOS.length) return null;
  return (
    <section id="testimonios" aria-labelledby="titulo-testimonios" className="shrink-0">
      <h2
        id="titulo-testimonios"
        className="text-center text-[17px] font-extrabold text-navy-900 lg:text-[19px]"
      >
        Lo que cuentan nuestros egresados
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TESTIMONIOS.map(({ nombre, programa, texto, foto }) => (
          <li key={nombre} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
            <figure>
              <blockquote className="text-[13.5px] leading-relaxed text-gris-texto">
                “{texto}”
              </blockquote>
              <figcaption className="mt-3 flex items-center gap-3">
                {foto && (
                  <img
                    src={`/testimonios/${foto}`}
                    alt=""
                    width="40"
                    height="40"
                    loading="lazy"
                    className="size-10 rounded-full object-cover"
                  />
                )}
                <span>
                  <span className="block text-[13px] font-bold text-navy-900">{nombre}</span>
                  <span className="block text-[12px] text-gris-texto">{programa}</span>
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
