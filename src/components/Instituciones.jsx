import { useEffect, useRef, useState } from 'react';
import { INSTITUCIONES, RUTA_LOGOS } from '../data/instituciones.js';
import { IconoLaptop, IconoVoltear } from './Iconos.jsx';

/**
 * Cada institución es una tarjeta de dos caras: el logo por delante y, al
 * voltearla, qué se estudia ahí. Solo hay una volteada a la vez.
 */
export default function Instituciones() {
  const [abierta, setAbierta] = useState(null);
  const [vista, setVista] = useState(false);
  const lista = useRef(null);
  const anterior = useRef(null);

  // El foco acompaña al giro: pasa al reverso al abrir y vuelve al logo al cerrar.
  useEffect(() => {
    const clave = abierta ?? anterior.current;
    anterior.current = abierta;
    if (!clave) return;
    const cara = abierta ? '.volteo__cerrar' : '.volteo__frente';
    lista.current?.querySelector(`[data-inst="${clave}"] ${cara}`)?.focus({ preventScroll: true });
  }, [abierta]);

  // Al entrar en pantalla las tarjetas se asoman una vez: así se nota que giran.
  useEffect(() => {
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        setVista(true);
        observador.disconnect();
      },
      { threshold: 0.3 },
    );
    observador.observe(lista.current);
    return () => observador.disconnect();
  }, []);

  return (
    <section id="instituciones" aria-labelledby="titulo-instituciones" className="shrink-0 lg:py-1">
      <h2
        id="titulo-instituciones"
        className="text-center text-[17px] font-extrabold text-navy-900 lg:text-[18px]"
      >
        Conoce nuestras instituciones
      </h2>
      <p className="mt-1 text-center text-[13px] text-gris-texto">
        Elige una institución para ver qué puedes estudiar.
      </p>

      <ul
        ref={lista}
        className="rejilla-inst"
        data-vista={vista ? '' : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAbierta(null);
        }}
      >
        {INSTITUCIONES.map((inst, i) => {
          const volteada = abierta === inst.archivo;
          const idReverso = `reverso-inst-${i}`;
          return (
            <li
              key={inst.archivo}
              className="volteo"
              data-inst={inst.archivo}
              data-abierta={volteada ? '' : undefined}
              style={{ '--orden': i }}
            >
              <div className="volteo__giro">
                <button
                  type="button"
                  className="volteo__cara volteo__frente"
                  aria-expanded={volteada}
                  aria-controls={idReverso}
                  inert={volteada}
                  data-medir={`Voltear: ${inst.nombre}`}
                  onClick={() => setAbierta(inst.archivo)}
                >
                  <span className="volteo__pista" aria-hidden="true">
                    <IconoVoltear />
                  </span>
                  <img
                    src={`${RUTA_LOGOS}/${inst.archivo}`}
                    alt={inst.nombre}
                    className="h-16 w-auto max-w-[88%] object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="text-[12px] leading-snug text-gris-texto">
                    {inst.descripcion}
                  </span>
                  <span className="visually-hidden">Ver qué puedes estudiar</span>
                </button>

                {/* Todo el reverso cierra al tocarlo; el botón da el mismo camino con teclado. */}
                <div
                  id={idReverso}
                  className="volteo__cara volteo__reverso"
                  inert={!volteada}
                  data-medir={`Cerrar: ${inst.nombre}`}
                  onClick={() => setAbierta(null)}
                >
                  <button
                    type="button"
                    className="volteo__pista volteo__cerrar"
                    aria-label={`Volver al logo de ${inst.nombre}`}
                  >
                    <IconoVoltear />
                  </button>
                  <h3 className="volteo__nombre">{inst.nombre}</h3>
                  <p className="volteo__tipo">{inst.tipo}</p>
                  <ul className="volteo__lista">
                    {inst.ofrece.map((linea) => (
                      <li key={linea}>{linea}</li>
                    ))}
                  </ul>
                  <p className="volteo__modalidad">
                    <IconoLaptop className="size-4 shrink-0 text-amarillo" />
                    {inst.modalidad}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
