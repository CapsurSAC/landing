/**
 * Tokens de inyección de los puertos. Las implementaciones viven en
 * `infrastructure` y se enlazan en los módulos de Nest con `useFactory`.
 */
export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');
export const SPECIALTY_REPOSITORY = Symbol('SPECIALTY_REPOSITORY');
export const PROMOTION_REPOSITORY = Symbol('PROMOTION_REPOSITORY');
export const CATALOG_CACHE = Symbol('CATALOG_CACHE');
export const CATALOG_CHANGE_NOTIFIER = Symbol('CATALOG_CHANGE_NOTIFIER');
export const CLOCK = Symbol('CLOCK');
