import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Download,
  Filter,
  GraduationCap,
  Hourglass,
  Lock,
  LogOut,
  Search,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getPromotions, getSpecialties } from '@/lib/catalog';
import { adminConfigured, currentAdmin } from '@/server/auth';
import { leadStats, listLeads } from '@/server/db';
import { login, logout } from './actions';
import { dialCode, filtersFrom, formatLimaDateTime, leadOrigin, whatsappDigits } from './leads-view';
import { StatusSelect } from './StatusSelect';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Panel de gestión',
  robots: { index: false, follow: false },
};

const LOGIN_ERRORS: Record<string, string> = {
  credenciales: 'Usuario o contraseña incorrectos.',
  limite: 'Demasiados intentos. Espera 15 minutos antes de volver a probar.',
  config: 'El panel no está configurado: faltan ADMIN_USER, ADMIN_PASSWORD_HASH o ADMIN_SESSION_SECRET en el .env.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const user = await currentAdmin();
  if (!user) {
    const errorKey = typeof params.error === 'string' ? params.error : adminConfigured() ? '' : 'config';
    return <LoginScreen error={LOGIN_ERRORS[errorKey]} />;
  }
  return <LeadsPanel user={user} params={params} />;
}

function LoginScreen({ error }: { error?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[linear-gradient(160deg,var(--color-navy-950),var(--color-brand-700))] px-4">
      <form action={login} className="w-full max-w-sm rounded-[var(--radius-card)] bg-white p-7 shadow-[var(--shadow-card)]">
        <p className="text-2xl font-extrabold tracking-tight text-navy-950">SIS · Panel de gestión</p>
        <p className="mt-1 text-sm text-ink-600">Solo personal autorizado.</p>
        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-danger-50 px-3 py-2.5 text-sm font-semibold text-danger-600">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        <label className="mt-5 block text-sm font-semibold text-ink-900" htmlFor="admin-user">
          Usuario
        </label>
        <input id="admin-user" name="user" type="email" autoComplete="username" required className="field-area mt-1.5" />
        <label className="mt-4 block text-sm font-semibold text-ink-900" htmlFor="admin-password">
          Contraseña
        </label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password" required className="field-area mt-1.5" />
        <button
          type="submit"
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 font-bold text-white hover:bg-brand-600"
        >
          <Lock className="size-4" aria-hidden="true" />
          Entrar
        </button>
      </form>
    </main>
  );
}

async function LeadsPanel({ user, params }: { user: string; params: Record<string, string | string[] | undefined> }) {
  const filters = filtersFrom(params);
  const [leads, stats, { items: promotions }, { items: specialties }] = await Promise.all([
    Promise.resolve(listLeads(filters, 500)),
    Promise.resolve(leadStats()),
    getPromotions(),
    getSpecialties(),
  ]);
  const exportQuery = new URLSearchParams(
    Object.entries({
      q: filters.q,
      promocion: filters.promotionId,
      carrera: filters.specialty,
      estado: filters.status,
      whatsapp: filters.whatsapp,
      desde: filters.from,
      hasta: filters.to,
    }).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();

  return (
    <div className="min-h-dvh bg-mist-50 lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="bg-[linear-gradient(180deg,var(--color-navy-950),var(--color-navy-800))] px-4 py-5 text-white lg:min-h-dvh">
        <p className="text-2xl font-extrabold tracking-tight">SIS</p>
        <p className="text-[0.8rem] text-white/70">Panel de gestión</p>
        <nav className="mt-6" aria-label="Panel">
          <span className="flex items-center gap-3 rounded-xl bg-brand-500 px-3 py-2.5 font-bold" aria-current="page">
            <Users className="size-5" aria-hidden="true" />
            Leads
          </span>
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-end gap-4 bg-navy-950 px-5 py-3 text-sm text-white">
          <span className="truncate">{user}</span>
          <form action={logout}>
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-3 py-1.5 font-bold hover:bg-white/10">
              <LogOut className="size-4" aria-hidden="true" />
              Salir
            </button>
          </form>
        </header>

        <main className="flex flex-col gap-5 p-5">
          <div className="flex items-center gap-3">
            <Users className="size-9 text-brand-500" aria-hidden="true" />
            <div>
              <h1 className="text-2xl font-extrabold text-ink-900">Leads</h1>
              <p className="text-sm text-ink-600">Todos los que empezaron el formulario, hayan abierto WhatsApp o no.</p>
            </div>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Resumen">
            <StatCard icon={Users} value={stats.total} label="Leads en total" highlight />
            <StatCard icon={Hourglass} value={stats.abandoned} label="Dejaron a medias (sin WhatsApp)" />
            <StatCard icon={Clock} value={stats.unattended} label="Sin atender (estado Nuevo)" />
            <StatCard icon={CalendarDays} value={stats.today} label="Hoy" />
            <StatCard icon={TrendingUp} value={stats.last7Days} label="Últimos 7 días" />
            <StatCard
              icon={GraduationCap}
              value={stats.topSpecialty?.name ?? '—'}
              label={stats.topSpecialty ? `Carrera más pedida · ${stats.topSpecialty.count}` : 'Carrera más pedida'}
              small
            />
          </section>

          <form method="get" className="rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-mist-200/60">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[2fr_1.4fr_1fr_1fr_1fr_1fr_1fr]">
              <FilterField label="Buscar" htmlFor="f-q" icon={Search}>
                <input id="f-q" name="q" defaultValue={filters.q} placeholder="Nombre, correo o celular" className="field-area" />
              </FilterField>
              <FilterField label="Carrera" htmlFor="f-carrera">
                <select id="f-carrera" name="carrera" defaultValue={filters.specialty} className="field-area">
                  <option value="">Todas</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Promoción" htmlFor="f-promo">
                <select id="f-promo" name="promocion" defaultValue={filters.promotionId} className="field-area">
                  <option value="">Todas</option>
                  {promotions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.headline})
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Estado" htmlFor="f-estado">
                <select id="f-estado" name="estado" defaultValue={filters.status} className="field-area">
                  <option value="">Todos</option>
                  <option value="nuevo">Nuevo</option>
                  <option value="contactado">Contactado</option>
                  <option value="matriculado">Matriculado</option>
                  <option value="descartado">Descartado</option>
                </select>
              </FilterField>
              <FilterField label="WhatsApp" htmlFor="f-whatsapp">
                <select id="f-whatsapp" name="whatsapp" defaultValue={filters.whatsapp} className="field-area">
                  <option value="">Todos</option>
                  <option value="si">Lo abrió</option>
                  <option value="no">Lo dejó a medias</option>
                </select>
              </FilterField>
              <FilterField label="Desde" htmlFor="f-desde">
                <input id="f-desde" name="desde" type="date" defaultValue={filters.from} className="field-area" />
              </FilterField>
              <FilterField label="Hasta" htmlFor="f-hasta">
                <input id="f-hasta" name="hasta" type="date" defaultValue={filters.to} className="field-area" />
              </FilterField>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 font-bold text-white hover:bg-brand-600">
                <Filter className="size-4" aria-hidden="true" />
                Filtrar
              </button>
              <Link href="/admin" className="inline-flex items-center rounded-xl border border-brand-500 px-4 py-2 font-bold text-brand-600 hover:bg-mist-50">
                Limpiar
              </Link>
              <a
                href={`/admin/export${exportQuery ? `?${exportQuery}` : ''}`}
                className="inline-flex items-center gap-2 rounded-xl border border-brand-500 px-4 py-2 font-bold text-brand-600 hover:bg-mist-50"
              >
                <Download className="size-4" aria-hidden="true" />
                Exportar CSV
              </a>
            </div>
          </form>

          <p className="text-sm text-ink-600">
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
            {leads.length === 500 ? ' (se muestran los 500 más recientes; exporta el CSV para verlos todos)' : ''}.
          </p>

          <div className="overflow-x-auto rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] ring-1 ring-mist-200/60">
            <table className="w-full min-w-[66rem] text-left text-sm">
              <thead className="bg-mist-100 text-[0.75rem] font-bold tracking-wide text-ink-700 uppercase">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Correo</th>
                  <th className="px-4 py-3">Celular</th>
                  <th className="px-4 py-3">Carrera</th>
                  <th className="px-4 py-3">Promoción</th>
                  <th className="px-4 py-3">Sede</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist-100">
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-ink-600">
                      Todavía no hay leads con estos filtros.
                    </td>
                  </tr>
                )}
                {leads.map((lead) => {
                  const { date, time } = formatLimaDateTime(lead.createdAt);
                  return (
                    <tr key={lead.id} className="align-middle">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="block font-semibold text-ink-900">{date}</span>
                        <span className="text-ink-600">{time}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5 font-bold text-ink-900">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mist-100 text-brand-600" aria-hidden="true">
                            {(lead.fullName.charAt(0) || '?').toUpperCase()}
                          </span>
                          {lead.fullName || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} className="text-brand-600 underline underline-offset-2">
                            {lead.email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {lead.phone ? (
                          <a
                            href={`https://wa.me/${whatsappDigits(lead)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 underline underline-offset-2"
                          >
                            {dialCode(lead.phoneCountry)} {lead.phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.specialties.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {lead.specialties.map((s) => (
                              <span key={s} className="rounded-full bg-mist-100 px-2.5 py-1 text-[0.78rem] font-semibold text-brand-700">
                                {s}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-ink-600">Lo decide con un asesor</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap text-ink-900">{lead.promotionName || '—'}</td>
                      <td className="px-4 py-3 capitalize">{lead.campus}</td>
                      <td className="px-4 py-3 text-ink-600">{leadOrigin(lead)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {lead.whatsappSentAt ? (
                          <span className="rounded-full bg-wa-500/15 px-2.5 py-1 text-[0.78rem] font-bold text-wa-700">Lo abrió</span>
                        ) : (
                          <span className="rounded-full bg-[#fff3d6] px-2.5 py-1 text-[0.78rem] font-bold text-[#8a5a00]" title={`Último cambio: ${formatLimaDateTime(lead.updatedAt).date} ${formatLimaDateTime(lead.updatedAt).time}`}>
                            A medias
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusSelect id={lead.id} status={lead.status} name={lead.fullName || `lead ${lead.id}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  highlight = false,
  small = false,
}: {
  icon: LucideIcon;
  value: number | string;
  label: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-[var(--radius-card)] p-4 shadow-[var(--shadow-card)] ring-1 ${
        highlight ? 'bg-[linear-gradient(135deg,var(--color-navy-900),var(--color-brand-600))] text-white ring-transparent' : 'bg-white ring-mist-200/60'
      }`}
    >
      <Icon className={`size-9 shrink-0 ${highlight ? 'text-white' : 'text-brand-500'}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className={`font-extrabold ${small ? 'text-lg leading-tight' : 'text-3xl'} ${highlight ? '' : 'text-ink-900'}`}>{value}</p>
        <p className={`text-sm ${highlight ? 'text-white/85' : 'text-ink-600'}`}>{label}</p>
      </div>
    </div>
  );
}

function FilterField({
  label,
  htmlFor,
  icon: Icon,
  children,
}: {
  label: string;
  htmlFor: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-ink-900">
        {Icon && <Icon className="size-4" aria-hidden="true" />}
        {label}
      </label>
      {children}
    </div>
  );
}
