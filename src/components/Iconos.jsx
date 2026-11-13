/**
 * Iconos en SVG inline: cero peticiones de red y heredan el color del texto.
 * Todos son decorativos, por eso van con aria-hidden.
 */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

export const IconoCheck = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={3}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const IconoBirrete = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M22 10 12 5 2 10l10 5 10-5Z" />
    <path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
  </svg>
);

export const IconoReloj = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
);

export const IconoUsuario = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export const IconoSobre = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </svg>
);

export const IconoWhatsApp = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden focusable="false">
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.08-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.07-.13-.27-.2-.57-.35Z" />
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 8.22 8.24c0 4.54-3.7 8.23-8.24 8.23Z" />
  </svg>
);

export const IconoEnviar = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </svg>
);

export const IconoAlerta = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={2.5}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </svg>
);

export const IconoCalendario = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <polyline points="9 16 11 18 15 14" />
  </svg>
);

/* Dos flechas en círculo: la tarjeta de institución se puede voltear */
export const IconoVoltear = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

/* ── Iconos de la sección "¿Por qué formarte con CAPSUR?" ── */

export const IconoTrofeo = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M6 3h12v6a6 6 0 0 1-12 0V3Z" />
    <path d="M12 15v4M8 21h8" />
  </svg>
);

export const IconoPersonas = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9.5" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconoLaptop = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M2 20h20" />
  </svg>
);

export const IconoMedalla = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="12" cy="9" r="6" />
    <path d="m8.5 14-1.3 7L12 18.5 16.8 21l-1.3-7" />
  </svg>
);

/* ── Sección "Programas por institución" ── */

export const IconoFlecha = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const IconoVolver = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export const IconoCompartir = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);

export const IconoLibro = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </svg>
);
