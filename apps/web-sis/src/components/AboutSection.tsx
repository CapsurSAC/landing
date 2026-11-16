import Image from 'next/image';
import { Briefcase, Clock, Headset, type LucideIcon } from 'lucide-react';
import { EndorsementSeal } from '@/components/EndorsementSeal';

interface Pillar {
  icon: LucideIcon;
  lines: [string, string];
}

const PILLARS: Pillar[] = [
  { icon: Briefcase, lines: ['Formación', 'orientada al trabajo'] },
  { icon: Clock, lines: ['Estudia', 'a tu ritmo'] },
  { icon: Headset, lines: ['Acompañamiento', 'real'] },
];

export function AboutSection() {
  return (
    <section id="nosotros" className="relative scroll-mt-20 overflow-hidden pt-3 pb-20 sm:pb-24">
      <div className="container-x grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
        <div className="relative aspect-[16/11] overflow-hidden rounded-r-[1.5rem] rounded-l-none shadow-[var(--shadow-card)] lg:-ml-[clamp(1rem,calc((100vw-1120px)/2+2rem),7rem)] lg:aspect-auto lg:h-[16.5rem]">
          <Image
            src="/about/campus.webp"
            alt="Fachada del campus de IEST Privado Sistemas del Sur."
            fill
            sizes="(min-width: 1024px) 48vw, 100vw"
            className="object-cover"
          />
        </div>

        <div>
          <h2 className="text-balance text-2xl leading-tight font-extrabold text-ink-900 sm:text-[1.9rem]">Sistemas del Sur</h2>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-ink-700 sm:text-[1rem]">
            Somos un Instituto de Educación Superior Tecnológico Privado especializado en tecnologías de la información, parte de GRUPO CAPSUR.
            Formamos técnicos que resuelven problemas reales con las herramientas que el mercado usa hoy.
          </p>
          <ul className="mt-6 grid grid-cols-1 divide-y divide-mist-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {PILLARS.map(({ icon: Icon, lines }, i) => (
              <li key={lines.join()} className={`flex items-center gap-3 py-3 sm:block sm:py-0 ${i === 0 ? 'sm:pr-4' : 'sm:px-4'}`}>
                <Icon className="size-8 text-brand-500" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-[0.95rem] font-bold leading-snug text-ink-900 sm:mt-3">
                  {lines[0]}
                  <br />
                  {lines[1]}
                </p>
              </li>
            ))}
          </ul>
          <EndorsementSeal className="mt-5" />
        </div>
      </div>

      {/* Ola azul que da paso al pie de página oscuro. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0">
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="block h-[70px] w-full sm:h-[100px]">
          <path d="M0 70C220 20 420 110 720 80C1000 52 1200 30 1440 60V120H0Z" fill="#2f7ff0" fillOpacity="0.5" />
          <path d="M0 95C260 50 480 120 760 92C1020 66 1220 60 1440 88V120H0Z" fill="#0060d8" />
        </svg>
      </div>
    </section>
  );
}
