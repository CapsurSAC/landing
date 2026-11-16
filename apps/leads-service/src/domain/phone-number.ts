import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { InvalidPhoneNumberError } from './errors';

/** Reglas adicionales por país sobre el número nacional (sin prefijo). */
const NATIONAL_RULES: Partial<Record<string, RegExp>> = {
  // Perú: móviles de 9 dígitos que empiezan por 9. Solo aceptamos WhatsApp, no fijos.
  PE: /^9\d{8}$/,
};

/**
 * Value object: teléfono normalizado a E.164. Se construye únicamente a través
 * de `parse`, que garantiza validez según libphonenumber y las reglas locales.
 */
export class PhoneNumber {
  private constructor(
    readonly e164: string,
    readonly country: string,
    readonly nationalNumber: string,
  ) {}

  static parse(raw: string, defaultCountry: string): PhoneNumber {
    const country = defaultCountry.toUpperCase();
    const parsed = parsePhoneNumberFromString(raw.trim(), country as CountryCode);
    if (!parsed || !parsed.isValid()) {
      throw new InvalidPhoneNumberError();
    }
    const resolvedCountry = parsed.country ?? country;
    const rule = NATIONAL_RULES[resolvedCountry];
    if (rule && !rule.test(parsed.nationalNumber)) {
      throw new InvalidPhoneNumberError();
    }
    return new PhoneNumber(parsed.number, resolvedCountry, parsed.nationalNumber);
  }

  toString(): string {
    return this.e164;
  }
}
