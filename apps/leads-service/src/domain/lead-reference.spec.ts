import { REFERENCE_ALPHABET, REFERENCE_PATTERN } from '@capsur/api-contracts';
import { LeadReference } from './lead-reference';

describe('LeadReference', () => {
  it('genera PREFIJO-XXXXX con 5 caracteres del alfabeto sin ambigüedad', () => {
    for (let i = 0; i < 200; i += 1) {
      const reference = LeadReference.generate('SIS');
      expect(reference.value).toMatch(REFERENCE_PATTERN);
      const [prefix, suffix] = reference.value.split('-');
      expect(prefix).toBe('SIS');
      expect(suffix).toHaveLength(5);
      for (const char of suffix!) {
        expect(REFERENCE_ALPHABET).toContain(char);
      }
      expect(suffix).not.toMatch(/[01OI]/);
    }
  });

  it('usa la fuente de aleatoriedad inyectada y pone el prefijo en mayúsculas', () => {
    const reference = LeadReference.generate('sis', () => 0);

    expect(reference.value).toBe('SIS-22222');
    expect(LeadReference.isValid(reference.value)).toBe(true);
  });

  it('valida el formato', () => {
    expect(LeadReference.isValid('SIS-7K3M2')).toBe(true);
    expect(LeadReference.isValid('SIS-7K3M')).toBe(false);
    expect(LeadReference.isValid('SIS-7K3M0')).toBe(false);
    expect(LeadReference.isValid('sis-7K3M2')).toBe(false);
    expect(() => LeadReference.fromString('X')).toThrow();
    expect(LeadReference.fromString('SIS-7K3M2').toString()).toBe('SIS-7K3M2');
  });
});
