import {
  type AdminPromotion,
  type AdminPromotionInput,
  AdminPromotionInputSchema,
  AdminPromotionListResponseSchema,
  AdminPromotionSchema,
  type AdminSpecialtyInput,
  AdminSpecialtyInputSchema,
  type AuditEntry,
  AuditEntrySchema,
  SlugSchema,
} from '@capsur/api-contracts';
import { Audited, AuditService, ZodValidationPipe } from '@capsur/nest-kit';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { type AdminSpecialty } from '../../application/mappers/contract.mapper';
import { ManagePromotions } from '../../application/use-cases/manage-promotions';
import { ManageSpecialties } from '../../application/use-cases/manage-specialties';
import { openApiSchema, PROBLEM_DETAILS_SCHEMA } from './openapi';
import { type BrandQuery, BrandQuerySchema, DEFAULT_BRAND } from './query.schemas';

const AuditQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) });
type AuditQuery = z.infer<typeof AuditQuerySchema>;

/**
 * Administración del catálogo para admin-web (A1). Todo `/internal/*` exige
 * token de servicio (guard global del kit) y cada escritura queda auditada
 * con el llamador y la persona (`x-actor`) (C24).
 */
@ApiTags('Administración')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Falta el token de servicio o no es válido', schema: PROBLEM_DETAILS_SCHEMA })
@Controller('internal/admin')
export class AdminCatalogController {
  constructor(
    @Inject(ManagePromotions) private readonly promotions: ManagePromotions,
    @Inject(ManageSpecialties) private readonly specialties: ManageSpecialties,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('promotions')
  @ApiQuery({ name: 'brand', required: false, example: DEFAULT_BRAND })
  @ApiOkResponse({ description: 'Todas las promociones, incluidas las inactivas', schema: openApiSchema(AdminPromotionListResponseSchema) })
  async listPromotions(@Query(new ZodValidationPipe(BrandQuerySchema)) query: BrandQuery): Promise<{ items: AdminPromotion[] }> {
    return { items: await this.promotions.list(query.brand) };
  }

  @Post('promotions')
  @HttpCode(HttpStatus.CREATED)
  @Audited('promotion.create', { target: (request) => readBodyId(request) })
  @ApiBody({ schema: openApiSchema(AdminPromotionInputSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(AdminPromotionSchema) })
  @ApiConflictResponse({ description: 'Ya existe una promoción con ese id', schema: PROBLEM_DETAILS_SCHEMA })
  @ApiBadRequestResponse({ description: 'Datos inválidos o campaña inexistente', schema: PROBLEM_DETAILS_SCHEMA })
  createPromotion(@Body(new ZodValidationPipe(AdminPromotionInputSchema)) input: AdminPromotionInput): Promise<AdminPromotion> {
    return this.promotions.create(input);
  }

  @Put('promotions/:id')
  @Audited('promotion.update', { target: 'id' })
  @ApiParam({ name: 'id', example: 'con-ia' })
  @ApiBody({ schema: openApiSchema(AdminPromotionInputSchema) })
  @ApiOkResponse({ schema: openApiSchema(AdminPromotionSchema) })
  @ApiNotFoundResponse({ schema: PROBLEM_DETAILS_SCHEMA })
  updatePromotion(
    @Param('id', new ZodValidationPipe(SlugSchema)) id: string,
    @Body(new ZodValidationPipe(AdminPromotionInputSchema)) input: AdminPromotionInput,
  ): Promise<AdminPromotion> {
    return this.promotions.update(id, input);
  }

  @Post('promotions/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Audited('promotion.deactivate', { target: 'id' })
  @ApiParam({ name: 'id', example: 'con-ia' })
  @ApiQuery({ name: 'brand', required: false, example: DEFAULT_BRAND })
  @ApiOkResponse({ schema: openApiSchema(AdminPromotionSchema) })
  @ApiNotFoundResponse({ schema: PROBLEM_DETAILS_SCHEMA })
  deactivatePromotion(
    @Param('id', new ZodValidationPipe(SlugSchema)) id: string,
    @Query(new ZodValidationPipe(BrandQuerySchema)) query: BrandQuery,
  ): Promise<AdminPromotion> {
    return this.promotions.deactivate(query.brand, id);
  }

  @Get('specialties')
  @ApiQuery({ name: 'brand', required: false, example: DEFAULT_BRAND })
  @ApiOkResponse({ description: 'Todas las especialidades, incluidas las inactivas' })
  async listSpecialties(@Query(new ZodValidationPipe(BrandQuerySchema)) query: BrandQuery): Promise<{ items: AdminSpecialty[] }> {
    return { items: await this.specialties.list(query.brand) };
  }

  @Put('specialties/:id')
  @Audited('specialty.update', { target: 'id' })
  @ApiParam({ name: 'id', example: 'desarrollo-web-con-ia' })
  @ApiBody({ schema: openApiSchema(AdminSpecialtyInputSchema) })
  @ApiNotFoundResponse({ schema: PROBLEM_DETAILS_SCHEMA })
  updateSpecialty(
    @Param('id', new ZodValidationPipe(SlugSchema)) id: string,
    @Body(new ZodValidationPipe(AdminSpecialtyInputSchema)) input: AdminSpecialtyInput,
  ): Promise<AdminSpecialty> {
    return this.specialties.update(id, input);
  }

  @Get('audit')
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ schema: openApiSchema(z.object({ items: z.array(AuditEntrySchema) })) })
  async listAudit(@Query(new ZodValidationPipe(AuditQuerySchema)) query: AuditQuery): Promise<{ items: AuditEntry[] }> {
    return { items: await this.audit.list(query.limit) };
  }
}

/** `target` de auditoría al crear: el id que viene en el cuerpo (nunca se guarda el cuerpo entero). */
function readBodyId(request: { body?: unknown }): string | null {
  const body = request.body;
  if (typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string') {
    return body.id;
  }
  return null;
}
