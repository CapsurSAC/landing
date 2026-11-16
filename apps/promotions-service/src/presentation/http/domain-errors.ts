import { mapDomainError, registerDomainErrors } from '@capsur/nest-kit';
import {
  BrandNotFoundError,
  CampaignNotFoundError,
  InvalidCatalogDataError,
  PromotionAlreadyExistsError,
  PromotionNotFoundError,
  SpecialtyNotFoundError,
} from '../../domain';

/**
 * Traducción de errores de dominio a problem-details (B4). Se registra una
 * vez al cargar el módulo; el `ProblemDetailsFilter` del kit la consulta.
 */
export function registerCatalogDomainErrors(): void {
  registerDomainErrors([
    mapDomainError(BrandNotFoundError, { status: 404, title: 'Marca no encontrada' }),
    mapDomainError(PromotionNotFoundError, { status: 404, title: 'Promoción no encontrada' }),
    mapDomainError(SpecialtyNotFoundError, { status: 404, title: 'Especialidad no encontrada' }),
    mapDomainError(PromotionAlreadyExistsError, { status: 409, title: 'La promoción ya existe' }),
    mapDomainError(CampaignNotFoundError, {
      status: 400,
      title: 'Campaña inexistente',
      errors: (error) => [{ path: 'campaignId', message: error.message }],
    }),
    mapDomainError(InvalidCatalogDataError, {
      status: 400,
      title: 'Datos del catálogo inválidos',
      errors: (error) => [{ path: error.path, message: error.message }],
    }),
  ]);
}
