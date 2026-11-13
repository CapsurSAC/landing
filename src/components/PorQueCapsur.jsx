import { IconoLaptop, IconoMedalla, IconoPersonas, IconoTrofeo } from './Iconos.jsx';

const RAZONES = [
  {
    icono: IconoTrofeo,
    color: 'text-amber-500 bg-amber-100',
    titulo: 'Programas alineados',
    detalle: 'al mercado laboral',
  },
  {
    icono: IconoPersonas,
    color: 'text-brand-600 bg-blue-100',
    titulo: 'Docentes con',
    detalle: 'experiencia profesional',
  },
  {
    icono: IconoLaptop,
    color: 'text-sky-600 bg-sky-100',
    titulo: 'Modalidad flexible',
    detalle: 'presencial, virtual o semipresencial',
  },
  {
    icono: IconoMedalla,
    color: 'text-purple-600 bg-purple-100',
    titulo: 'Respaldo institucional',
    detalle: 'y calidad académica',
  },
];

export default function PorQueCapsur() {
  return (
    <section
      id="porque"
      aria-labelledby="titulo-porque"
      className="shrink-0 rounded-3xl bg-lavanda px-4 py-4 lg:px-6"
    >
      <h2
        id="titulo-porque"
        className="text-center text-[17px] font-extrabold text-navy-900 lg:text-[19px]"
      >
        ¿Por qué formarte con CAPSUR?
      </h2>

      {/* En pantallas grandes el icono va al lado del texto: ocupa menos alto */}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4 lg:gap-y-0">
        {RAZONES.map(({ icono: Icono, color, titulo, detalle }) => (
          <li key={titulo} className="flex flex-col items-center gap-2 text-center lg:flex-row lg:text-left">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${color}`}>
              <Icono className="size-5" />
            </span>
            <span>
              <span className="block text-[13px] leading-tight font-bold text-navy-900">
                {titulo}
              </span>
              <span className="block text-[12px] leading-tight text-gris-texto">{detalle}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
