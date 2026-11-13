import LogoCapsur from './LogoCapsur.jsx';
import { IconoCalendario } from './Iconos.jsx';

export default function Footer() {
  return (
    <footer className="shrink-0 bg-navy-900">
      <div className="mx-auto flex max-w-[100rem] flex-col items-center gap-3 px-5 py-4 text-center sm:flex-row sm:justify-between sm:gap-8 sm:px-8 sm:text-left lg:py-3">
        <p className="flex items-center gap-3 text-[15px] leading-tight font-bold text-white sm:text-[17px]">
          <IconoCalendario className="size-7 shrink-0 text-white/90" />
          <span>
            Da hoy el primer paso
            <br />
            hacia <span className="text-amarillo">nuevas oportunidades</span>
          </span>
        </p>

        <div aria-hidden="true" className="hidden h-10 w-px bg-white/25 sm:block" />

        <LogoCapsur variante="claro" />
      </div>
    </footer>
  );
}
