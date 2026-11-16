/**
 * Historial público de la política de privacidad (A28). Cada cambio de fondo
 * añade una entrada y sube NEXT_PUBLIC_PRIVACY_POLICY_VERSION: el backend
 * guarda la versión aceptada en cada registro de consentimiento.
 */
export interface PrivacyPolicyVersion {
  version: string;
  /** Fecha de publicación (YYYY-MM-DD). */
  publishedOn: string;
  summary: string;
}

export const privacyPolicyVersions: PrivacyPolicyVersion[] = [
  {
    version: '2026-11',
    publishedOn: '2026-11-13',
    summary:
      'Primera versión publicada: datos que recoge el formulario de catálogo, finalidades, conservación, encargados del tratamiento y ejercicio de derechos ARCO.',
  },
];
