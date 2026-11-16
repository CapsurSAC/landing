import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { institution } from '@/content/institution';
import { ComplaintForm } from './ComplaintForm';

export const metadata: Metadata = {
  title: 'Libro de Reclamaciones',
  description: 'Libro de Reclamaciones virtual de IEST Privado Sistemas del Sur, conforme al Código de Protección y Defensa del Consumidor.',
  alternates: { canonical: '/libro-de-reclamaciones' },
};

/** Libro de Reclamaciones virtual (A5; Ley 29571 y su reglamento). */
export default function ComplaintsBookPage() {
  const campus = institution.campus.tacna;
  return (
    <>
      <Header />
      <main className="container-x py-10 sm:py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="flex items-center gap-3 text-balance text-3xl font-extrabold leading-tight text-ink-900 sm:text-4xl">
            <BookOpen className="size-9 shrink-0 text-brand-500" strokeWidth={1.75} aria-hidden="true" />
            Libro de Reclamaciones
          </h1>
          <p className="mt-3 text-pretty text-ink-600">
            Conforme a lo establecido en el Código de Protección y Defensa del Consumidor (Ley N.º 29571), ponemos a tu disposición nuestro
            Libro de Reclamaciones virtual. Al enviar la hoja recibirás un código y la fecha límite de respuesta.
          </p>
          <dl className="mt-5 grid gap-3 rounded-[var(--radius-card)] bg-white p-5 text-[0.9rem] shadow-[var(--shadow-card)] ring-1 ring-mist-200/60 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-ink-600">Proveedor</dt>
              <dd className="font-bold text-ink-900">{institution.legalName}</dd>
            </div>
            {institution.ruc && (
              <div>
                <dt className="font-semibold text-ink-600">RUC</dt>
                <dd className="font-bold text-ink-900">{institution.ruc}</dd>
              </div>
            )}
            <div>
              <dt className="font-semibold text-ink-600">Dirección</dt>
              <dd className="font-bold text-ink-900">
                {campus.address}, {campus.city}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-600">Central telefónica</dt>
              <dd className="font-bold text-ink-900">{campus.phoneDisplay}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[0.85rem] text-ink-600">
            Los campos con <span className="text-danger-600">*</span> son obligatorios. El proveedor dará respuesta en un plazo no mayor a
            quince (15) días hábiles.
          </p>
          <div className="mt-6">
            <ComplaintForm />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
