/**
 * Reglas de validación del formulario. Salen de server/config/reglas.json,
 * el mismo archivo que usa el PHP: se cambian allí y valen para los dos.
 */
import reglas from '../../server/config/reglas.json';

/**
 * Para el atributo pattern, que ya calza con el valor completo.
 * Celular peruano: 9 dígitos que empiezan con 9, con o sin +51 delante, y con
 * espacios o guiones entre los dígitos. Correo: el dominio debe terminar en un
 * punto y al menos dos letras (.com, .pe…); type="email" solo no lo exige.
 */
export const PATRON_CELULAR = reglas.celular;
export const PATRON_CORREO = reglas.correo;

const completo = (patron) => new RegExp(`^(?:${patron})$`);
const CELULAR = completo(reglas.celular);
const CORREO = completo(reglas.correo);
const INVENTADOS = reglas.celularInventado.map(completo);

export const celularValido = (valor) => CELULAR.test(valor);
export const correoValido = (valor) => CORREO.test(valor);

/**
 * Celular con el formato correcto pero evidentemente inventado: un dígito
 * repetido (911 111 111), una escalera (987 654 321, 912 345 678) o un bloque
 * repetido (987 987 987, 912 121 212, 999 888 777).
 * No prueba que el número exista: solo descarta los falsos más comunes.
 */
export const celularInventado = (valor) => {
  const d = String(valor)
    .replace(/\D/g, '')
    .replace(/^51(?=\d{9}$)/, '');
  return /^9\d{8}$/.test(d) && INVENTADOS.some((r) => r.test(d));
};
