import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { type SpecialtiesResponse, SpecialtiesResponseSchema } from '@capsur/api-contracts';
import { ListSpecialties } from '../../application/use-cases/list-specialties';
import { openApiSchema, PROBLEM_DETAILS_SCHEMA } from './openapi';
import { PUBLIC_CACHE_CONTROL } from './promotions.controller';
import { DEFAULT_BRAND, type SpecialtiesQuery, SpecialtiesQuerySchema } from './query.schemas';
import { ZodValidationPipe } from '@capsur/nest-kit';

@ApiTags('Catálogo público')
@Controller('api/v1/specialties')
export class SpecialtiesController {
  constructor(@Inject(ListSpecialties) private readonly listSpecialties: ListSpecialties) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiQuery({ name: 'brand', required: false, example: DEFAULT_BRAND, description: 'Slug de la marca' })
  @ApiQuery({ name: 'track', required: false, enum: ['ia', 'tradicional'], description: 'Línea formativa' })
  @ApiOkResponse({
    description: 'Especialidades activas de la marca, ordenadas por sortOrder',
    schema: openApiSchema(SpecialtiesResponseSchema),
  })
  @ApiNotFoundResponse({ description: 'La marca no existe', schema: PROBLEM_DETAILS_SCHEMA })
  list(
    @Query(new ZodValidationPipe(SpecialtiesQuerySchema)) query: SpecialtiesQuery,
  ): Promise<SpecialtiesResponse> {
    return this.listSpecialties.execute({ brandId: query.brand, track: query.track });
  }
}
