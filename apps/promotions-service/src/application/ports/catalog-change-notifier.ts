/**
 * Avisa de que el catálogo de una marca cambió (B8): invalida la caché propia
 * y pide a la landing que revalide sus páginas. Nunca lanza: un fallo de
 * aviso no debe revertir un cambio ya guardado.
 */
export interface CatalogChangeNotifier {
  catalogChanged(brandId: string): Promise<void>;
}
