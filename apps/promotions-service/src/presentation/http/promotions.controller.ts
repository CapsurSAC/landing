import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { type PromotionsResponse, PromotionsResponseSchema } from '@capsur/api-contracts';
import { ListActivePromotions } from '../../application/use-cases/list-active-promotions';
import { openApiSchema, PROBLEM_DETAILS_SCHEMA } from './openapi';
import { type BrandQuery, BrandQuerySchema, DEFAULT_BRAND } from './query.schemas';
import { ZodValidationPipe } from '@capsur/nest-kit';

/** Cabecera de caché HTTP para el catálogo público (CDN/navegador). */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

@ApiTags('Catálogo público')
@Controller('api/v1/promotions')
export class PromotionsController {
  constructor(
    @Inject(ListActivePromotions) private readonly listActivePromotions: ListActivePromotions,
  ) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE_CONTROL)
  @ApiQuery({ name: 'brand', required: false, example: DEFAULT_BRAND, description: 'Slug de la marca' })
  @ApiOkResponse({
    description: 'Promociones activas y vigentes, ordenadas por sortOrder',
    schema: openApiSchema(PromotionsResponseSchema),
  })
  @ApiNotFoundResponse({ description: 'La marca no existe', schema: PROBLEM_DETAILS_SCHEMA })
  list(@Query(new ZodValidationPipe(BrandQuerySchema)) query: BrandQuery): Promise<PromotionsResponse> {
    return this.listActivePromotions.execute({ brandId: query.brand });
  }
}
