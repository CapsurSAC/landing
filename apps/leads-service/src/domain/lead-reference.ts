import { randomInt } from 'node:crypto';
import { REFERENCE_ALPHABET, REFERENCE_PATTERN } from '@capsur/api-contracts';

export const REFERENCE_SUFFIX_LENGTH = 5;

/** Fuente de aleatoriedad inyectable (los tests pueden fijarla). */
export type RandomIndex = (maxExclusive: number) => number;

/**
 * Código corto legible que viaja en el mensaje de WhatsApp: `SIS-7K3M2`.
 * El alfabeto excluye caracteres ambiguos (0/O, 1/I).
 */
export class LeadReference {
  private constructor(readonly value: string) {}

  static generate(prefix: string, random: RandomIndex = randomInt): LeadReference {
    let suffix = '';
    for (let i = 0; i < REFERENCE_SUFFIX_LENGTH; i += 1) {
      suffix += REFERENCE_ALPHABET.charAt(random(REFERENCE_ALPHABET.length));
    }
    return new LeadReference(`${prefix.toUpperCase()}-${suffix}`);
  }

  static isValid(value: string): boolean {
    return REFERENCE_PATTERN.test(value);
  }

  static fromString(value: string): LeadReference {
    if (!LeadReference.isValid(value)) {
      throw new Error(`Referencia con formato inválido: ${value}`);
    }
    return new LeadReference(value);
  }

  toString(): string {
    return this.value;
  }
}
