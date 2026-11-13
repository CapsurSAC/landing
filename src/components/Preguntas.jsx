import { PREGUNTAS } from '../data/contenido.js';

/** Datos estructurados FAQPage: Google puede mostrar las preguntas en el resultado. */
const datosEstructurados = () =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: PREGUNTAS.map(({ pregunta, respuesta }) => ({
      '@type': 'Question',
      name: pregunta,
      acceptedAnswer: { '@type': 'Answer', text: respuesta },
    })),
  }).replace(/</g, '\\u003c');

/**
 * Preguntas frecuentes (src/data/contenido.js). Sin preguntas confirmadas no
 * se pinta nada. <details> se abre y cierra sin JavaScript y con teclado.
 */
export default function Preguntas() {
  if (!PREGUNTAS.length) return null;
  return (
    <section id="preguntas" aria-labelledby="titulo-preguntas" className="shrink-0">
      <h2
        id="titulo-preguntas"
        className="text-center text-[17px] font-extrabold text-navy-900 lg:text-[19px]"
      >
        Preguntas frecuentes
      </h2>
      <div className="mt-3 divide-y divide-slate-200 rounded-3xl bg-white px-5 shadow-sm ring-1 ring-slate-900/5">
        {PREGUNTAS.map(({ pregunta, respuesta }) => (
          <details key={pregunta} className="group py-3">
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-bold text-navy-900"
              data-medir={`Pregunta: ${pregunta}`}
            >
              {pregunta}
              <span
                aria-hidden="true"
                className="text-brand-600 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-2 text-[13.5px] leading-relaxed text-gris-texto">{respuesta}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: datosEstructurados() }}
      />
    </section>
  );
}
