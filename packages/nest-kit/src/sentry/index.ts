/**
 * Punto de entrada `@capsur/nest-kit/sentry`: no importa Nest, para poder
 * inicializar Sentry antes que el resto de módulos.
 */
export { initSentry, type InitSentryOptions } from './init-sentry';
export { scrubSentryEvent, type SentryEventLike } from './scrub';
export { reportServerError, setErrorReporter, type ErrorReporter } from './error-reporter';
