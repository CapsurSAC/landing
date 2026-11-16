import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { HeroExperimentBeacon } from '@/components/HeroExperimentBeacon';

export function Hero() {
  return (
    <section id="inicio" className="hero-gradient relative overflow-hidden text-white">
      <div className="container-x grid items-end gap-6 lg:min-h-[23rem] lg:grid-cols-[1fr_1.05fr] lg:gap-4">
        <div className="relative z-10 max-w-lg self-center pt-10 pb-8 lg:py-12">
          <p className="flex items-center gap-2 text-[0.72rem] font-bold tracking-[0.22em] text-white/90">
            <span aria-hidden="true" className="text-cyan-400">
              /
            </span>
            ESPECIALIDADES CON IA
          </p>
          {/* A18: variante «a» (control) = texto aprobado; «b» = alternativa. Solo una se muestra (ver globals.css). */}
          <h1 className="mt-3 text-balance text-[2.3rem] leading-[1.02] font-extrabold tracking-[-0.02em] sm:text-[2.75rem] lg:text-[3.1rem]">
            <span className="hero-copy-a">
              Tu experiencia,
              <br />
              <span className="text-cyan-400">al siguiente nivel.</span>
            </span>
            <span className="hero-copy-b">
              Especialízate con IA,
              <br />
              <span className="text-cyan-400">100% virtual.</span>
            </span>
          </h1>
          <p className="mt-4 max-w-[22rem] text-pretty text-base leading-relaxed text-white/85 sm:text-[1.1rem]">
            <span className="hero-copy-a">Potencia tu formación técnica con herramientas de Inteligencia Artificial.</span>
            <span className="hero-copy-b">Con respaldo del Colegio de Ingenieros del Perú y plataforma disponible 24/7.</span>
          </p>
          <HeroExperimentBeacon />
          <a
            href="#especialidades"
            className="mt-6 inline-flex min-h-12 items-center gap-3 rounded-full bg-white px-6 text-[0.95rem] font-bold text-navy-900 shadow-[0_14px_30px_-12px_rgb(0,0,0,0.5)] transition-transform hover:scale-[1.02] active:scale-[0.99]"
          >
            Conoce nuestras especialidades
            <ArrowRight className="size-5 text-brand-500" aria-hidden="true" />
          </a>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

/** Foto de estudiantes alineada al borde inferior sobre un marco diagonal luminoso. */
function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-[6/5] w-full max-w-[26rem] lg:aspect-auto lg:h-full lg:min-h-[23rem] lg:max-w-none">
      <span aria-hidden="true" className="glow-frame left-[12%] top-[-4%] w-[78%] rounded-[4rem] opacity-90" />
      <span
        aria-hidden="true"
        className="absolute left-[8%] top-[10%] h-[75%] w-[84%] rounded-[3rem] bg-brand-500/35 blur-3xl"
      />
      <Image
        src="/hero/students.webp"
        alt="Dos estudiantes de Sistemas del Sur con una laptop frente al campus."
        width={1200}
        height={1000}
        priority
        fetchPriority="high"
        sizes="(min-width: 1024px) 48vw, 100vw"
        className="absolute inset-x-0 bottom-0 z-10 mx-auto h-[104%] w-auto max-w-full object-contain object-bottom drop-shadow-[0_30px_40px_rgba(3,12,40,0.55)]"
      />
    </div>
  );
}
