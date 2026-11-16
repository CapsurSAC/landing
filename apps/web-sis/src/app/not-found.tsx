import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="container-x py-20 text-center">
        <h1 className="text-4xl font-extrabold text-ink-900">Página no encontrada</h1>
        <p className="mt-3 text-ink-600">La dirección no existe o cambió de lugar.</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-600">
          Ir al inicio
        </Link>
      </main>
      <Footer />
    </>
  );
}
