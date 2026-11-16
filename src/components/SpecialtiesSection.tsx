import type { Specialty } from '@capsur/api-contracts';
import Link from 'next/link';
import { ArrowRight, Code, Database, Layers, ShieldCheck, type LucideIcon } from 'lucide-react';

interface SpecialtiesSectionProps {
  specialties: Specialty[];
}

/** Icono y descripción corta por especialidad (la descripción larga vive en el catálogo). */
const PRESENTATION: Record<string, { icon: LucideIcon; title: string; tagline: string }> = {
  'desarrollo-web-con-ia': { icon: Code, title: 'Desarrollo Web con IA', tagline: 'Crea plataformas inteligentes con herramientas de IA.' },
  'ciberseguridad-4-0': { icon: ShieldCheck, title: 'Ciberseguridad 4.0', tagline: 'Defiende sistemas con estrategias y automatización basada en IA.' },
  'gestion-integral-bd-con-ia': { icon: Database, title: 'Gestión Integral de Bases de Datos con IA', tagline: 'Diseña, administra y optimiza bases de datos con IA.' },
};

export function SpecialtiesSection({ specialties }: SpecialtiesSectionProps) {
  const ia = specialties.filter((s) => s.track === 'ia');

  return (
    <section id="especialidades" className="scroll-mt-20 py-7 sm:py-8">
      <div className="container-x">
        <h2 className="flex items-center gap-3 text-balance text-2xl leading-tight font-extrabold text-ink-900 sm:text-[1.85rem]">
          <Layers className="size-8 shrink-0 text-cyan-400" strokeWidth={1.75} aria-hidden="true" />
          Especialidades que puedes elegir
        </h2>
        <p className="mt-2 max-w-3xl text-pretty text-[0.95rem] text-ink-600">
          Programas virtuales con enfoque práctico, tecnologías actuales y respaldo del Colegio de Ingenieros del Perú.
        </p>

        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {ia.map((s) => {
            const pres = PRESENTATION[s.id] ?? { icon: Layers, title: s.shortName ?? s.name, tagline: firstSentence(s.summary) };
            const Icon = pres.icon;
            return (
              <li key={s.id} className="min-w-0">
                <Link
                  href={`/especialidades/${s.id}`}
                  className="group flex h-full items-start gap-3 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 transition-transform hover:-translate-y-0.5"
                >
                  <span className="inline-flex size-[3.25rem] shrink-0 items-center justify-center rounded-2xl bg-mist-100 text-brand-500">
                    <Icon className="size-6" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-balance text-[1.05rem] font-extrabold leading-snug text-ink-900">{pres.title}</span>
                    <span className="mt-1 block text-pretty text-[0.82rem] leading-snug text-ink-600">{pres.tagline}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-mist-100 text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white"
                  >
                    <ArrowRight className="size-5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

      </div>
    </section>
  );
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.:]+[.:]?/);
  return (match?.[0] ?? text).trim();
}

/** Icono de una especialidad como componente (evita crear componentes durante el render). */
export function SpecialtyIcon({ id, ...props }: { id: string } & React.ComponentProps<LucideIcon>) {
  const Icon = PRESENTATION[id]?.icon ?? Layers;
  return <Icon {...props} />;
}
