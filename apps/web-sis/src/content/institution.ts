/**
 * Datos institucionales verificables (web oficial y brochures). Los campos
 * vacíos se ocultan en la interfaz; completarlos solo con datos confirmados
 * por el cliente (ver README, «Datos pendientes»).
 */
export const institution = {
  legalName: 'IEST Privado Sistemas del Sur',
  /** RUC del titular del servicio (pendiente de confirmar). */
  ruc: '',
  campus: {
    tacna: {
      label: 'Sede Tacna',
      address: 'Calle Deustua 270',
      city: 'Tacna',
      /** Central telefónica publicada en la web oficial. */
      phoneDisplay: '052-350006',
      phoneE164: '+5152350006',
      /** Horario de atención (pendiente de confirmar; vacío = no se muestra). */
      openingHours: '',
    },
  },
  /** Sedes que el formulario ofrece para la atención (contrato CampusSchema). */
  campusOptions: [
    { value: 'tacna', label: 'Tacna' },
    { value: 'arequipa', label: 'Arequipa' },
  ],
  /** Correo para reclamos y protección de datos (pendiente; vacío = se usa el formulario). */
  contactEmail: '',
} as const;

export function googleMapsUrl(address: string, city: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${city}, Perú`)}`;
}
