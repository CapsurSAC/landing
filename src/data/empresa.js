/**
 * Datos del proveedor para el Libro de Reclamaciones (D.S. 011-2011-PCM).
 * ►► ANTES DE PUBLICAR reemplaza cada « » con el dato real de CAPSUR.
 * El servidor usa los mismos datos desde EMPRESA_RAZON_SOCIAL, EMPRESA_RUC y
 * EMPRESA_DIRECCION para el correo con la copia del reclamo.
 */
export const EMPRESA = {
  razonSocial: '«Razón social completa»',
  ruc: '«N.º de RUC»',
  direccion: '«Dirección completa, distrito, provincia, departamento»',
};

/** true mientras quede algún dato por completar (la página lo avisa). */
export const EMPRESA_PENDIENTE = Object.values(EMPRESA).some((v) => v.includes('«'));
