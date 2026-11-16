import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { PrivacyRequestForm } from './PrivacyRequestForm';

export const metadata: Metadata = {
  title: 'Derechos ARCO',
  description: 'Ejerce tus derechos de acceso, rectificación, cancelación y oposición sobre tus datos personales en Sistemas del Sur.',
  alternates: { canonical: '/derechos-arco' },
};

/** Formulario de derechos ARCO (C9; Ley 29733 y D.S. 016-2024-JUS). */
export default function PrivacyRightsPage() {
  return (
    <>
      <Header />
      <main className="container-x py-10 sm:py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="flex items-center gap-3 text-balance text-3xl font-extrabold leading-tight text-ink-900 sm:text-4xl">
            <ShieldCheck className="size-9 shrink-0 text-brand-500" strokeWidth={1.75} aria-hidden="true" />
            Derechos ARCO
          </h1>
          <p className="mt-3 text-pretty text-ink-600">
            Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición, o revocar tu consentimiento, conforme a la Ley N.º
            29733 y su Reglamento. Revisa nuestra{' '}
            <Link href="/politica-de-privacidad" className="font-semibold text-brand-600 underline underline-offset-2">
              política de privacidad
            </Link>
            .
          </p>
          <div className="mt-6">
            <PrivacyRequestForm />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
