import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PromotionValidationSchema, SpecialtyTrackSchema } from '@capsur/api-contracts';
import { z } from 'zod';
import { type PromotionValidationWithSpecialties } from '../../application/mappers/contract.mapper';
import { ValidatePromotion } from '../../application/use-cases/validate-promotion';
import { openApiSchema, PROBLEM_DETAILS_SCHEMA } from './openapi';
import { type BrandQuery, BrandQuerySchema, DEFAULT_BRAND, PromotionIdParamSchema } from './query.schemas';
import { ZodValidationPipe } from '@capsur/nest-kit';

/** Respuesta interna: contrato base + cupos y especialidades elegibles (A3). */
const ValidationResponseSchema = PromotionValidationSchema.extend({
  specialtiesIncluded: z.number().int(),
  allowedSpecialties: z.array(z.object({ id: z.string(), name: z.string(), track: SpecialtyTrackSchema })),
});

@ApiTags('Interno')
@ApiBearerAuth()
@Controller('internal/promotions')
export class InternalPromotionsController {
  constructor(@Inject(ValidatePromotion) private readonly validatePromotion: ValidatePromotion) {}

  @Get(':id/validate')
  @ApiParam({ name: 'id', description: 'Slug de la promoción', example: 'con-ia' })
  @ApiQuery({ name: 'brand', required: false, example: DEFAULT_BRAND, description: 'Slug de la marca' })
  @ApiOkResponse({
    description: 'Precio autoritativo, vigencia y especialidades elegibles de la promoción (sin caché)',
    schema: openApiSchema(ValidationResponseSchema),
  })
  @ApiNotFoundResponse({
    description: 'La marca o la promoción no existen',
    schema: PROBLEM_DETAILS_SCHEMA,
  })
  validate(
    @Param('id', new ZodValidationPipe(PromotionIdParamSchema)) promotionId: string,
    @Query(new ZodValidationPipe(BrandQuerySchema)) query: BrandQuery,
  ): Promise<PromotionValidationWithSpecialties> {
    return this.validatePromotion.execute({ brandId: query.brand, promotionId });
  }
}
