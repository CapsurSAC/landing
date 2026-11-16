import { mapDomainError, registerDomainErrors } from '@capsur/nest-kit';
import {
  CaptchaInvalidError,
  CaptchaUnavailableError,
  CatalogUnavailableError,
  ComplaintNotFoundError,
  FeedbackAlreadySubmittedError,
  IdempotencyKeyReusedError,
  InvalidPhoneNumberError,
  InvalidSpecialtiesError,
  LeadNotFoundError,
  PrivacyRequestNotFoundError,
  PromotionNotAvailableError,
  TooManyRequestsError,
} from '../../domain/errors';

/**
 * Traducción de los errores de dominio a problem-details (B4). Se registra en
 * el `ProblemDetailsFilter` global del kit; gana la clase más específica.
 */
export function registerLeadsDomainErrors(): void {
  registerDomainErrors([
    mapDomainError(InvalidPhoneNumberError, {
      status: 400,
      title: 'Solicitud inválida',
      detail: 'Revisa los campos marcados.',
      errors: (error) => [{ path: error.path, message: error.message }],
    }),
    mapDomainError(InvalidSpecialtiesError, {
      status: 400,
      title: 'Solicitud inválida',
      detail: 'Revisa los campos marcados.',
      errors: (error) => [{ path: error.path, message: error.message }],
    }),
    mapDomainError(CaptchaInvalidError, { status: 400, title: 'Captcha inválido' }),
    mapDomainError(LeadNotFoundError, { status: 404, title: 'Solicitud no encontrada' }),
    mapDomainError(ComplaintNotFoundError, { status: 404, title: 'Reclamo no encontrado' }),
    mapDomainError(PrivacyRequestNotFoundError, { status: 404, title: 'Solicitud ARCO no encontrada' }),
    mapDomainError(FeedbackAlreadySubmittedError, { status: 409, title: 'Respuesta ya registrada' }),
    mapDomainError(IdempotencyKeyReusedError, { status: 422, title: 'Clave de idempotencia reutilizada' }),
    mapDomainError(PromotionNotAvailableError, { status: 422, title: 'Promoción no disponible' }),
    mapDomainError(TooManyRequestsError, {
      status: 429,
      title: 'Demasiadas solicitudes',
      headers: (error) => ({ 'Retry-After': String(error.retryAfterSeconds) }),
    }),
    mapDomainError(CatalogUnavailableError, {
      status: 503,
      title: 'Catálogo no disponible',
      detail: (error) => error.message,
      headers: (error) => ({ 'Retry-After': String(error.retryAfterSeconds) }),
    }),
    mapDomainError(CaptchaUnavailableError, {
      status: 503,
      title: 'Captcha no disponible',
      detail: (error) => error.message,
      headers: (error) => ({ 'Retry-After': String(error.retryAfterSeconds) }),
    }),
  ]);
}
