import { useState } from 'react';
import { IconoCheck } from './Iconos.jsx';

const BENEFICIOS = [
  'Titulación y convalidación',
  'Especializaciones y diplomados',
  'Capacitación para el trabajo',
  'Programas por áreas de alta demanda',
];

export default function Hero() {
  const [fotoFalla, setFotoFalla] = useState(false);

  return (
    <section
      id="inicio"
      /* La propia sección es la rejilla: así su única fila se estira a toda la
         altura de la tarjeta (la mínima o la que le dé flex-1) y la foto
         apoya en el borde inferior. Con una rejilla anidada y h-full, la fila
         medía solo lo que el texto y la foto quedaba colgada a media tarjeta. */
      className="relative grid min-h-[28rem] w-full flex-1 items-end gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy-800 to-brand-600 shadow-xl sm:grid-cols-[1.24fr_0.76fr]"
    >

        {/* ── Texto ─────────────────────────────────────────── */}
        <div className="flex h-full flex-col justify-center px-7 py-7 sm:pl-9 lg:py-6">
          <h1 className="text-[30px] leading-[1.12] font-extrabold text-balance text-white sm:text-[34px] lg:text-[32px] xl:text-[38px]">
            ¿Cuál es tu próximo
            <br />
            <span className="relative inline-block whitespace-nowrap text-amarillo italic">
              paso profesional?
              {/* Subrayado manuscrito */}
              <svg
                viewBox="0 0 300 14"
                className="absolute -bottom-1 left-0 h-3 w-full"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M3 9c60-6 130-7 294-4"
                  fill="none"
                  stroke="#FFD12E"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-white/90 lg:mt-4">
            Responde 3 preguntas y descubre alternativas de formación que pueden ayudarte a
            fortalecer tu perfil profesional.
          </p>

          <ul className="mt-5 space-y-2.5 lg:mt-4">
            {BENEFICIOS.map((texto) => (
              <li key={texto} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-amarillo"
                >
                  <IconoCheck className="size-3 text-navy-900" />
                </span>
                <span className="text-[14.5px] leading-snug font-medium text-white">{texto}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Foto ──────────────────────────────────────────── */}
        <div className="relative hidden h-full items-end justify-center sm:flex">
          {/* Círculo amarillo decorativo del diseño */}
          <div
            aria-hidden="true"
            className="absolute top-8 right-2 size-24 rounded-full bg-amarillo/90"
          />
          {!fotoFalla ? (
            <img
              src="/hero-estudiantes.webp"
              alt="Dos jóvenes profesionales sonriendo, ella con una laptop y él con una tablet"
              width="865"
              height="1026"
              /* Es la candidata a LCP: prioridad alta y nunca lazy */
              fetchPriority="high"
              decoding="async"
              onError={() => setFotoFalla(true)}
              className="relative z-10 h-full w-auto origin-bottom object-contain object-bottom sm:scale-[1.15] xl:scale-100"
            />
          ) : (
            /* Marcador mientras no se sube la foto definitiva */
            <div
              className="relative z-10 m-5 flex min-h-32 flex-1 items-center justify-center self-center rounded-2xl border-2 border-dashed border-white/40 p-3 text-center text-[12px] leading-snug text-white/70"
              role="note"
            >
              <span className="block">Coloca la foto en</span>
              <code className="mt-1 block font-mono text-white/90">
                public/hero-estudiantes.webp
              </code>
            </div>
          )}
        </div>
    </section>
  );
}
