'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { cn } from '@/lib/cn';

const NAV_LINKS = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#promociones', label: 'Promociones' },
  { href: '#especialidades', label: 'Especialidades' },
  { href: '#nosotros', label: 'Nosotros' },
];

/** `anchorBase`: '' en las páginas que contienen las secciones (landing y /promociones/[id]); '/' en el resto. */
export function Header({ anchorBase = '/' }: { anchorBase?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-950/90 text-white backdrop-blur-md">
      <div className="container-x flex h-[4.75rem] items-center gap-6 lg:gap-8">
        <Link href="/" className="flex shrink-0 items-center rounded-lg" aria-label="IEST Privado Sistemas del Sur, inicio">
          <Image
            src="/brand/sis-logo-white.png"
            alt="IEST Privado Sistemas del Sur"
            width={1820}
            height={687}
            priority
            className="h-11 w-auto sm:h-[3.1rem]"
            sizes="180px"
          />
        </Link>

        <span aria-hidden="true" className="hidden h-8 w-px bg-white/25 lg:block" />

        <nav aria-label="Principal" className="hidden items-center gap-9 lg:flex">
          {NAV_LINKS.map((link, index) => (
            <a
              key={link.href}
              href={`${anchorBase}${link.href}`}
              className={cn(
                'relative rounded-md py-2 text-[0.95rem] font-bold text-white/85 transition-colors hover:text-white',
                index === 0 && 'text-white after:absolute after:inset-x-1 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-cyan-400',
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href={`${anchorBase}#catalogo`}
            className="hidden items-center gap-2.5 rounded-full border border-white/45 bg-white/5 px-5 py-2.5 text-[0.9rem] font-bold transition-colors hover:border-cyan-300 hover:bg-white/10 sm:inline-flex"
          >
            <WhatsAppIcon className="size-5 text-wa-500" />
            Solicita información
          </a>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-lg text-white hover:bg-white/10 lg:hidden"
            aria-expanded={open}
            aria-controls="menu-movil"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="visually-hidden">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
            {open ? <X className="size-7" aria-hidden="true" /> : <Menu className="size-7" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        id="menu-movil"
        hidden={!open}
        className="border-t border-white/10 bg-navy-950 lg:hidden"
      >
        <nav aria-label="Principal móvil" className="container-x flex flex-col py-3">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={`${anchorBase}${link.href}`}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-3 text-base font-semibold text-white/90 hover:bg-white/10"
            >
              {link.label}
            </a>
          ))}
          <a
            href={`${anchorBase}#catalogo`}
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex items-center justify-center gap-2.5 rounded-full border border-white/40 px-5 py-3 text-sm font-semibold"
          >
            <WhatsAppIcon className="size-5 text-wa-500" />
            Solicita información
          </a>
        </nav>
      </div>
    </header>
  );
}
