import type { Metadata } from 'next';
import { safeNextPath } from '@/lib/csp';
import { first, type SearchParams } from '@/lib/lead-filters';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const next = safeNextPath(first(sp.next));
  return (
    <main className="sidebar-gradient flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <p className="text-xs font-semibold tracking-[0.2em] text-cyan-300 uppercase">GRUPO CAPSUR</p>
          <h1 className="mt-1 text-2xl font-bold">Panel interno</h1>
          <p className="mt-1 text-sm text-mist-200">IEST Privado Sistemas del Sur</p>
        </div>
        <div className="card p-6">
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-xs text-mist-200">
          Acceso restringido al personal autorizado. Las acciones quedan registradas.
        </p>
      </div>
    </main>
  );
}
