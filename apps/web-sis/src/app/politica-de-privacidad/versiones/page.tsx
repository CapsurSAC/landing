import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { privacyPolicyVersions } from '@/content/privacy-versions';
import { siteConfig } from '@/lib/config';
import { formatLongDate } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Historial de la política de privacidad',
  description: 'Versiones publicadas de la política de privacidad de IEST Privado Sistemas del Sur y sus cambios.',
  alternates: { canonical: '/politica-de-privacidad/versiones' },
};

/** Historial público de versiones de la política de privacidad (A28). */
export default function PrivacyVersionsPage() {
  const versions = [...privacyPolicyVersions].sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));
  return (
    <>
      <Header />
      <main className="container-x py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-balance text-3xl font-extrabold leading-tight text-ink-900 sm:text-4xl">Historial de la política de privacidad</h1>
          <p className="mt-3 text-pretty text-ink-600">
            Cada vez que la política cambia de fondo publicamos una versión nueva. Al enviar el formulario guardamos la versión que aceptaste.
          </p>
          <ol className="mt-8 flex flex-col gap-4" data-testid="privacy-versions">
            {versions.map((v) => (
              <li key={v.version} className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60">
                <h2 className="flex flex-wrap items-center gap-2 text-lg font-extrabold text-ink-900">
                  Versión {v.version}
                  {v.version === siteConfig.privacyPolicyVersion && (
                    <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-[0.75rem] font-bold text-white">Vigente</span>
                  )}
                </h2>
                <p className="mt-1 text-[0.9rem] text-ink-600">
                  Publicada el <time dateTime={v.publishedOn}>{formatLongDate(v.publishedOn)}</time>
                </p>
                <p className="mt-2 text-pretty text-ink-700">{v.summary}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8">
            <Link href="/politica-de-privacidad" className="font-semibold text-brand-600 underline underline-offset-2">
              Ver la política vigente
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
