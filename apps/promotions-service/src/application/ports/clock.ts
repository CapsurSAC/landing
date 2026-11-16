/** Reloj inyectable para que la vigencia sea determinista en pruebas. */
export interface Clock {
  now(): Date;
}
