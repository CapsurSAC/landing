/**
 * Control de acceso por rol. Es la ÚNICA fuente de verdad de permisos: las
 * páginas, las acciones de servidor, los route handlers y la navegación
 * consultan `can()`. Ocultar un botón nunca sustituye a la comprobación en el
 * servidor.
 */

export const ROLES = ['admin', 'asesor'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'reports:read',
  'leads:read',
  'leads:export',
  'leads:anonymize',
  'promotions:manage',
  'complaints:manage',
  'privacy:manage',
  'status:read',
  'status:retry',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set(PERMISSIONS),
  // El asesor solo consulta leads y su detalle: sin exportar ni anonimizar.
  asesor: new Set<Permission>(['leads:read']),
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role || !isRole(role)) return false;
  return GRANTS[role].has(permission);
}

/** Página de inicio según el rol (tras iniciar sesión o si no tiene permiso). */
export function homeFor(role: Role): string {
  return can(role, 'reports:read') ? '/' : '/leads';
}

export interface NavItem {
  href: string;
  label: string;
  permission: Permission;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Resumen', permission: 'reports:read' },
  { href: '/leads', label: 'Leads', permission: 'leads:read' },
  { href: '/promociones', label: 'Promociones', permission: 'promotions:manage' },
  { href: '/reclamaciones', label: 'Reclamaciones', permission: 'complaints:manage' },
  { href: '/privacidad', label: 'Privacidad (ARCO)', permission: 'privacy:manage' },
  { href: '/estado', label: 'Estado', permission: 'status:read' },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission));
}

export const ROLE_LABELS: Record<Role, string> = { admin: 'Administración', asesor: 'Asesor' };
