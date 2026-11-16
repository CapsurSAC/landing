import { LogOut } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLinks } from '@/components/NavLinks';
import { navFor, ROLE_LABELS } from '@/lib/roles';
import { requireUser } from '@/lib/server/auth';
import { logoutAction } from './actions';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const items = navFor(user.role).map(({ href, label }) => ({ href, label }));

  const brand = (
    <Link href="/" className="flex items-center gap-2 text-white">
      <span aria-hidden="true" className="inline-flex size-8 rotate-45 items-center justify-center rounded-md bg-brand-500">
        <span className="-rotate-45 text-[0.6rem] font-extrabold">SIS</span>
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold">Panel CAPSUR</span>
        <span className="block text-[0.7rem] text-cyan-300">Sistemas del Sur</span>
      </span>
    </Link>
  );

  const userBox = (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-semibold text-white" title={user.email}>
          {user.name}
        </p>
        <p className="text-xs text-cyan-300" data-testid="user-role">
          {ROLE_LABELS[user.role]}
        </p>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="btn border-white/20 bg-white/5 text-mist-100 hover:bg-white/15">
          <LogOut className="size-4" aria-hidden="true" />
          Salir
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a href="#contenido" className="visually-hidden">
        Saltar al contenido
      </a>
      {/* Escritorio: barra lateral fija */}
      <div className="sidebar-gradient hidden lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-6 px-3 py-5">
          <div className="px-2">{brand}</div>
          <nav aria-label="Secciones del panel" className="flex-1">
            <NavLinks items={items} orientation="vertical" />
          </nav>
          <div className="border-t border-white/10 px-2 pt-4">{userBox}</div>
        </aside>
      </div>
      {/* Móvil y tableta: cabecera con navegación horizontal desplazable */}
      <header className="sidebar-gradient sticky top-0 z-20 space-y-3 px-4 pt-3 pb-2 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          {brand}
          <div className="max-w-[60%]">{userBox}</div>
        </div>
        <nav aria-label="Secciones del panel">
          <NavLinks items={items} orientation="horizontal" />
        </nav>
      </header>
      <main id="contenido" className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[90rem]">{children}</div>
      </main>
    </div>
  );
}
