import { InvalidPhoneNumberError } from './errors';
import { PhoneNumber } from './phone-number';

describe('PhoneNumber', () => {
  it('normaliza un móvil peruano escrito con espacios a E.164', () => {
    const phone = PhoneNumber.parse('987 654 321', 'PE');

    expect(phone.e164).toBe('+51987654321');
    expect(phone.country).toBe('PE');
    expect(phone.nationalNumber).toBe('987654321');
    expect(String(phone)).toBe('+51987654321');
  });

  it('acepta el prefijo internacional y país en minúsculas', () => {
    expect(PhoneNumber.parse('+51 987-654-321', 'pe').e164).toBe('+51987654321');
  });

  it('acepta un móvil argentino con país AR', () => {
    const phone = PhoneNumber.parse('+54 9 11 2345 6789', 'AR');

    expect(phone.e164).toBe('+5491123456789');
    expect(phone.country).toBe('AR');
  });

  it('rechaza números demasiado cortos', () => {
    expect(() => PhoneNumber.parse('123456', 'PE')).toThrow(InvalidPhoneNumberError);
  });

  it('rechaza en Perú los números que no son móviles (no empiezan por 9)', () => {
    expect(() => PhoneNumber.parse('(01) 234 5678', 'PE')).toThrow(InvalidPhoneNumberError);
    expect(() => PhoneNumber.parse('812345678', 'PE')).toThrow(InvalidPhoneNumberError);
  });

  it('rechaza texto que no es un teléfono', () => {
    expect(() => PhoneNumber.parse('no soy un número', 'PE')).toThrow(InvalidPhoneNumberError);
  });
});
