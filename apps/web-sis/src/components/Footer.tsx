import { BookOpen } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { FacebookIcon, InstagramIcon, LinkedInIcon, TikTokIcon, YouTubeIcon } from '@/components/icons/SocialIcons';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { formatWhatsAppForDisplay, siteConfig } from '@/lib/config';

const SOCIAL = [
  { key: 'facebook', label: 'Facebook', Icon: FacebookIcon },
  { key: 'instagram', label: 'Instagram', Icon: InstagramIcon },
  { key: 'tiktok', label: 'TikTok', Icon: TikTokIcon },
  { key: 'linkedin', label: 'LinkedIn', Icon: LinkedInIcon },
  { key: 'youtube', label: 'YouTube', Icon: YouTubeIcon },
] as const;

const SECTIONS = [
  { href: '/#inicio', label: 'Inicio' },
  { href: '/#promociones', label: 'Promociones' },
  { href: '/#especialidades', label: 'Especialidades' },
  { href: '/#nosotros', label: 'Nosotros' },
  { href: '/politica-de-privacidad', label: 'Política de privacidad' },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-navy-950 pt-8 pb-5 text-white/80">
      <div className="container-x grid gap-10 lg:grid-cols-[1.3fr_1fr_0.9fr] lg:gap-8">
        <div className="flex items-center gap-5">
          <Image src="/brand/sis-logo-white.png" alt="IEST Privado Sistemas del Sur" width={1820} height={687} className="h-12 w-auto" sizes="200px" />
          <p className="max-w-xs border-l border-white/20 pl-5 text-pretty text-[0.8rem] leading-relaxed">
            Especialidades y carreras técnicas con enfoque en Inteligencia Artificial. Una marca de GRUPO CAPSUR.
          </p>
        </div>

        <nav aria-label="Pie de página">
          <h2 className="text-sm font-bold text-white">Secciones</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[0.8rem]">
            {SECTIONS.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="hover:text-white">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-bold text-white">Contacto</h2>
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-[0.85rem] font-semibold text-white hover:text-cyan-300"
          >
            <WhatsAppIcon className="size-5 text-wa-500" />
            {formatWhatsAppForDisplay(siteConfig.whatsappNumber)}
          </a>
          <ul className="mt-4 flex flex-wrap gap-2.5" aria-label="Redes sociales">
            {SOCIAL.map(({ key, label, Icon }) => {
              const href = siteConfig.social[key];
              const classes =
                'inline-flex size-9 items-center justify-center rounded-lg border border-white/25 text-white transition-colors hover:border-cyan-300 hover:text-cyan-300';
              return (
                <li key={key}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={classes}>
                      <Icon className="size-4" />
                    </a>
                  ) : (
                    <span aria-label={`${label} (próximamente)`} title={`${label}: enlace pendiente`} className={`${classes} opacity-60`}>
                      <Icon className="size-4" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {/* A5: enlace obligatorio al Libro de Reclamaciones virtual (Ley 29571). */}
          <Link
            href="/libro-de-reclamaciones"
            className="mt-4 inline-flex items-center gap-2.5 rounded-lg border border-white/25 bg-white/5 px-3 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:border-cyan-300 hover:text-cyan-300"
            data-testid="footer-complaints-link"
          >
            <BookOpen className="size-5 shrink-0" aria-hidden="true" />
            Libro de Reclamaciones
          </Link>
        </div>
      </div>
      <div className="container-x mt-8 border-t border-white/10 pt-4 text-center text-xs text-white/60">
        © {year} {siteConfig.legalName}. Todos los derechos reservados.
      </div>
    </footer>
  );
}
