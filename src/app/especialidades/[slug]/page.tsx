import type { Promotion, Specialty } from '@capsur/api-contracts';
import { ArrowRight, BadgeCheck, CalendarClock, Check, ChevronRight, GraduationCap, MonitorSmartphone, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { JsonLd } from '@/components/JsonLd';
import { MobileActions } from '@/components/MobileActions';
import { SpecialtyIcon } from '@/components/SpecialtiesSection';
import { SpecialtyViewBeacon } from '@/components/SpecialtyViewBeacon';
import { BROCHURE_BENEFITS, CERTIFICATE_ENDORSEMENT, specialtyContent } from '@/content/specialties';
import { getPromotions, getSpecialties } from '@/lib/catalog';
import { siteConfig } from '@/lib/config';
import { fallbackSpecialties } from '@/lib/fallback-catalog';
import { eligibleSpecialties, TRACK_LABEL } from '@/lib/specialty-selection';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Rutas conocidas en el build (catálogo de respaldo); las nuevas del catálogo se resuelven en runtime. */
export const dynamicParams = true;
export function generateStaticParams() {
  return fallbackSpecialties.map((s) => ({ slug: s.id }));
}

async function loadSpecialty(slug: string): Promise<{ specialty: Specialty; promotions: Promotion[] } | null> {
  const [specialties, promotions] = await Promise.all([getSpecialties(), getPromotions()]);
  const specialty = specialties.items.find((s) => s.id === slug) ?? fallbackSpecialties.find((s) => s.id === slug);
  if (!specialty) return null;
  const including = promotions.items.filter((p) => eligibleSpecialties(p, [specialty]).length > 0);
  return { specialty, promotions: including };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadSpecialty(slug);
  if (!data) return { title: 'Especialidad no encontrada', robots: { index: false } };
  const { specialty } = data;
  const title = specialty.shortName ?? specialty.name;
  return {
    title,
    description: specialty.summary,
    alternates: { canonical: `/especialidades/${specialty.id}` },
    openGraph: {
      type: 'website',
      locale: 'es_PE',
      siteName: siteConfig.legalName,
      title: `${title} | ${siteConfig.brandName}`,
      description: specialty.summary,
      url: `/especialidades/${specialty.id}`,
    },
  };
}

export default async function SpecialtyPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadSpecialty(slug);
  if (!data) notFound();
  const { specialty, promotions } = data;
  const content = specialtyContent[specialty.id];

  const title = specialty.name;
  const bestPromotion = promotions.find((p) => p.featured) ?? promotions[0];
  const catalogHref = bestPromotion ? `/promociones/${bestPromotion.id}#catalogo` : '/#catalogo';
  const whatsappHref = buildWhatsAppUrl(
    siteConfig.whatsappNumber,
    `Hola. Quiero información sobre la especialidad ${specialty.shortName ?? specialty.name}. La vi en la web de ${siteConfig.brandName}.`,
  );

  const benefits: string[] = content
    ? [...BROCHURE_BENEFITS]
    : [
        `Modalidad ${specialty.modality}.`,
        'Acceso a la plataforma virtual 24/7.',
        'Soporte académico de lunes a viernes.',
        ...(specialty.endorsedBy ? [`Con respaldo del ${specialty.endorsedBy}.`] : []),
      ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: specialty.name,
    description: content?.presentation ?? specialty.summary,
    url: `${siteConfig.siteUrl}/especialidades/${specialty.id}`,
    inLanguage: 'es-PE',
    provider: {
      '@type': 'EducationalOrganization',
      name: siteConfig.legalName,
      sameAs: siteConfig.siteUrl,
    },
    audience: specialty.audience.length > 0 ? { '@type': 'Audience', audienceType: specialty.audience.join(', ') } : undefined,
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      ...(content ? { courseWorkload: `PT${content.facts.academicHours}H` } : {}),
    },
    ...(content ? { syllabusSections: content.syllabus.map((m) => ({ '@type': 'Syllabus', name: m.title })) } : {}),
  };

  return (
    <>
      <Header />
      <main>
        <section className="hero-gradient text-white">
          <div className="container-x py-8 sm:py-10">
            <nav aria-label="Ruta de navegación">
              <ol className="flex flex-wrap items-center gap-1.5 text-[0.8rem] text-white/75">
                <li>
                  <Link href="/" className="hover:text-white">
                    Inicio
                  </Link>
                </li>
                <li aria-hidden="true">
                  <ChevronRight className="size-3.5" />
                </li>
                <li>
                  <Link href="/#especialidades" className="hover:text-white">
                    Especialidades
                  </Link>
                </li>
                <li aria-hidden="true">
                  <ChevronRight className="size-3.5" />
                </li>
                <li aria-current="page" className="font-semibold text-white">
                  {specialty.shortName ?? specialty.name}
                </li>
              </ol>
            </nav>
            <div className="mt-5 flex items-start gap-4">
              <span className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-cyan-300 ring-1 ring-white/20 sm:inline-flex">
                <SpecialtyIcon id={specialty.id} className="size-7" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="max-w-3xl">
                <p className="flex items-center gap-2 text-[0.72rem] font-bold tracking-[0.22em] text-white/90">
                  <span aria-hidden="true" className="text-cyan-400">
                    /
                  </span>
                  ESPECIALIDAD · {TRACK_LABEL[specialty.track].toUpperCase()}
                </p>
                <h1 className="mt-2 text-balance text-[1.9rem] leading-[1.08] font-extrabold tracking-[-0.01em] sm:text-[2.4rem]">{title}</h1>
                <p className="mt-3 text-pretty text-base leading-relaxed text-white/85 sm:text-[1.05rem]">{specialty.summary}</p>
                <ul className="mt-4 flex flex-wrap gap-2 text-[0.8rem] font-semibold">
                  <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/20">
                    <MonitorSmartphone className="size-4 text-cyan-300" aria-hidden="true" />
                    {specialty.modality}
                  </li>
                  {content && (
                    <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/20">
                      <CalendarClock className="size-4 text-cyan-300" aria-hidden="true" />
                      {content.facts.months} meses · {content.facts.academicHours} horas académicas
                    </li>
                  )}
                  {specialty.endorsedBy && (
                    <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/20">
                      <BadgeCheck className="size-4 text-cyan-300" aria-hidden="true" />
                      Respaldo del {specialty.endorsedBy}
                    </li>
                  )}
                </ul>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={catalogHref}
                    className="wa-gradient inline-flex min-h-12 items-center gap-2.5 rounded-full px-6 text-[0.95rem] font-bold text-white shadow-[var(--shadow-cta)] transition-transform hover:scale-[1.02]"
                  >
                    <WhatsAppIcon className="size-5" />
                    Solicitar catálogo
                    <ArrowRight className="size-5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container-x grid gap-6 py-8 lg:grid-cols-[1.6fr_1fr] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            {content && (
              <Card title="Presentación">
                <p className="text-pretty leading-relaxed text-ink-700">{content.presentation}</p>
              </Card>
            )}

            <Card title="Dirigido a" icon={<Users className="size-6 text-brand-500" strokeWidth={1.75} aria-hidden="true" />}>
              {content ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {content.audience.map((a) => (
                    <li key={a.title} className="rounded-2xl bg-mist-50 p-4">
                      <p className="font-bold text-ink-900">{a.title}</p>
                      <p className="mt-1 text-pretty text-[0.88rem] leading-snug text-ink-600">{a.description}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-col gap-2">
                  {specialty.audience.map((a) => (
                    <li key={a} className="flex items-start gap-2 text-ink-700">
                      <Check className="mt-0.5 size-5 shrink-0 text-wa-600" aria-hidden="true" />
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {content && content.syllabus.length > 0 && (
              <Card title="Temario" icon={<GraduationCap className="size-6 text-brand-500" strokeWidth={1.75} aria-hidden="true" />}>
                <ol className="flex flex-col gap-3">
                  {content.syllabus.map((module, index) => (
                    <li key={module.title} className="rounded-2xl bg-mist-50 p-4">
                      <p className="text-[0.75rem] font-bold tracking-[0.18em] text-brand-600">MÓDULO {String(index + 1).padStart(2, '0')}</p>
                      <p className="mt-1 font-bold text-ink-900">{module.title}</p>
                      {module.topics.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.88rem] text-ink-700">
                          {module.topics.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
                {content.syllabusPartial && (
                  <p className="mt-3 text-[0.85rem] text-ink-600">Este es un extracto del temario. El temario completo te lo envía un asesor por WhatsApp.</p>
                )}
              </Card>
            )}
            {!content && (
              <Card title="Temario y duración">
                <p className="text-ink-700">El temario completo, la duración y las fechas te los confirma un asesor por WhatsApp.</p>
              </Card>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-24">
            <Card title="Beneficios">
              <ul className="flex flex-col gap-2.5">
                {benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-[0.92rem] text-ink-700">
                    <Check className="mt-0.5 size-5 shrink-0 text-wa-600" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>
            </Card>

            {content && (
              <Card title="Certificado">
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <Fact label="Meses" value={content.facts.months} />
                  <Fact label="Créditos" value={content.facts.credits} />
                  <Fact label="Horas académicas" value={content.facts.academicHours} />
                </dl>
                <p className="mt-3 text-[0.85rem] text-ink-600">{CERTIFICATE_ENDORSEMENT}</p>
              </Card>
            )}

            <Card title="¿Te interesa?">
              {promotions.length > 0 ? (
                <>
                  <p className="text-[0.9rem] text-ink-700">Puedes elegirla en estas promociones:</p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {promotions.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/promociones/${p.id}#catalogo`}
                          className="flex items-center justify-between gap-3 rounded-2xl bg-mist-50 px-4 py-3 ring-1 ring-mist-200 transition-colors hover:ring-brand-400"
                        >
                          <span>
                            <span className="block font-extrabold text-ink-900">{p.name}</span>
                            <span className="block text-[0.8rem] text-ink-600">{p.bundle.label}</span>
                          </span>
                          <span className="text-xl font-extrabold text-brand-600">{p.headline}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[0.9rem] text-ink-700">Un asesor te informa cómo inscribirte en esta especialidad.</p>
              )}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-[0.9rem] font-bold text-brand-600 underline underline-offset-2 hover:text-brand-700"
              >
                <WhatsAppIcon className="size-5" />
                Pregúntale a un asesor por WhatsApp
              </a>
            </Card>
          </aside>
        </div>
      </main>
      <Footer />
      <MobileActions fallbackHref={catalogHref} />
      <SpecialtyViewBeacon specialtyId={specialty.id} />
      <JsonLd data={jsonLd} />
    </>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 sm:p-6">
      <h2 className="flex items-center gap-2.5 text-[1.25rem] font-extrabold text-ink-900">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-mist-50 px-2 py-3">
      <dt className="text-[0.72rem] font-semibold text-ink-600">{label}</dt>
      <dd className="text-2xl font-extrabold text-brand-600">{String(value).padStart(2, '0')}</dd>
    </div>
  );
}
