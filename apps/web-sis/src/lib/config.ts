/**
 * Configuración pública de la landing. Solo variables NEXT_PUBLIC_* o valores
 * de marca sin secretos. Los precios y vigencias vienen siempre del backend.
 */
export const siteConfig = {
  brand: 'sis' as const,
  brandName: 'Sistemas del Sur',
  legalName: 'IEST Privado Sistemas del Sur',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  /** Vacío = mismo origen; el gateway o las reescrituras de Next enrutan /api/v1. */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '51987867402',
  privacyPolicyVersion: process.env.NEXT_PUBLIC_PRIVACY_POLICY_VERSION ?? '2026-11',
  /**
   * Casilla opcional de autorización publicitaria (separada de la solicitud de
   * información). El diseño aprobado no la muestra; se activa cuando el área
   * legal lo requiera sin tocar el formulario.
   */
  showMarketingConsent: process.env.NEXT_PUBLIC_SHOW_MARKETING_CONSENT === '1',
  /** Clave pública de Cloudflare Turnstile. Vacía = sin widget (el servidor tampoco lo exige). */
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
  /** DSN de Sentry para el navegador. Vacío = Sentry desactivado. */
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  /** Activa los experimentos A/B (asignación por sessionId). */
  experimentsEnabled: (process.env.NEXT_PUBLIC_EXPERIMENTS_ENABLED ?? 'true') === 'true',
  /** Central telefónica publicada en la web oficial (botón «Llamar» en móvil). */
  phone: { display: '052-350006', href: 'tel:+5152350006' },
  /** Redes oficiales publicadas en sistemasdelsur.edu.pe (se pueden sobrescribir por entorno). */
  social: {
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK ?? 'https://www.facebook.com/ISTPSistemasDelSur',
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM ?? 'https://www.instagram.com/istp_sistemasdelsur/',
    tiktok: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK ?? 'https://www.tiktok.com/@istp.sistemasdelsur',
    linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN ?? 'https://www.linkedin.com/in/istp-sistemas-del-sur-81bb81355',
    youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE ?? 'https://www.youtube.com/@institutosis6394',
  } as Record<'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'youtube', string>,
};

export const phoneCountries = [
  { code: 'PE', dial: '+51', label: 'Perú', placeholder: '987 654 321' },
  { code: 'BO', dial: '+591', label: 'Bolivia', placeholder: '71234567' },
  { code: 'CL', dial: '+56', label: 'Chile', placeholder: '9 1234 5678' },
  { code: 'CO', dial: '+57', label: 'Colombia', placeholder: '300 1234567' },
  { code: 'EC', dial: '+593', label: 'Ecuador', placeholder: '99 123 4567' },
  { code: 'AR', dial: '+54', label: 'Argentina', placeholder: '9 11 2345 6789' },
  { code: 'US', dial: '+1', label: 'Estados Unidos', placeholder: '305 123 4567' },
] as const;

export type PhoneCountryCode = (typeof phoneCountries)[number]['code'];

export function formatWhatsAppForDisplay(numberWithoutPlus: string): string {
  const digits = numberWithoutPlus.replace(/\D/g, '');
  if (digits.startsWith('51') && digits.length === 11) {
    return `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}
