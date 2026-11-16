import { type AdminSpecialtyInput } from '@capsur/api-contracts';
import { type Brand, BrandNotFoundError, InvalidCatalogDataError, Specialty } from '../../domain';
import {
  type AdminSpecialty,
  specialtyPropsFromInput,
  toAdminSpecialty,
  toContractBrand,
} from '../mappers/contract.mapper';
import { type BrandRepository, type CatalogChangeNotifier, type SpecialtyRepository } from '../ports';

export interface ManageSpecialtiesDeps {
  readonly brands: BrandRepository;
  readonly specialties: SpecialtyRepository;
  readonly notifier: CatalogChangeNotifier;
}

/** Edición de especialidades desde el panel (A1). */
export class ManageSpecialties {
  constructor(private readonly deps: ManageSpecialtiesDeps) {}

  async list(brandId: string): Promise<AdminSpecialty[]> {
    const brand = await this.requireBrand(brandId);
    const specialties = await this.deps.specialties.listByBrand(brand.id);
    const contractBrand = toContractBrand(brand);
    return specialties.map((specialty) => toAdminSpecialty(specialty, contractBrand));
  }

  async update(specialtyId: string, input: AdminSpecialtyInput): Promise<AdminSpecialty> {
    if (input.id !== specialtyId) {
      throw new InvalidCatalogDataError('id', 'El identificador del cuerpo no coincide con el de la ruta');
    }
    const brand = await this.requireBrand(input.brand);
    const updated = await this.deps.specialties.update(new Specialty(specialtyPropsFromInput(input)));
    await this.deps.notifier.catalogChanged(brand.id);
    return toAdminSpecialty(updated, toContractBrand(brand));
  }

  private async requireBrand(brandId: string): Promise<Brand> {
    const brand = await this.deps.brands.findActiveById(brandId);
    if (!brand) {
      throw new BrandNotFoundError(brandId);
    }
    return brand;
  }
}
