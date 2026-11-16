import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ACTOR_HEADER,
  AdminComplaintResponseInputSchema,
  AdminComplaintSchema,
  AdminLeadListQuerySchema,
  AdminLeadListResponseSchema,
  AdminLeadSchema,
  AdminPrivacyRequestSchema,
  AdminPrivacyResolutionInputSchema,
  AuditEntrySchema,
  BrandSchema,
  ComplaintStatusSchema,
  PaginationQuerySchema,
  PrivacyRequestStatusSchema,
  paginated,
  type AdminComplaint,
  type AdminLead,
  type AdminLeadListQuery,
  type AdminLeadListResponse,
  type AdminPrivacyRequest,
  type AuditEntry,
} from '@capsur/api-contracts';
import { Audited, AuditService, InternalActor, ZodValidationPipe } from '@capsur/nest-kit';
import type { Response } from 'express';
import { z } from 'zod';
import type { AdminLeads } from '../../application/use-cases/admin-leads';
import type { AnonymizeLeadResult } from '../../application/use-cases/anonymize-lead';
import type { ManageComplaints, ManagePrivacyRequests } from '../../application/use-cases/compliance';
import { ADMIN_LEADS, MANAGE_COMPLAINTS, MANAGE_PRIVACY_REQUESTS } from '../../application/use-cases/tokens';
import { ComplaintNotFoundError, LeadNotFoundError, PrivacyRequestNotFoundError } from '../../domain/errors';
import { ProblemDetailsOpenApi, zodToOpenApi } from './openapi';

const IdSchema = z.uuid();

export const AdminLeadExportQuerySchema = AdminLeadListQuerySchema.omit({ page: true, pageSize: true });
export const AdminComplaintListQuerySchema = PaginationQuerySchema.extend({
  brand: BrandSchema.optional(),
  status: ComplaintStatusSchema.optional(),
});
export const AdminPrivacyListQuerySchema = PaginationQuerySchema.extend({
  brand: BrandSchema.optional(),
  status: PrivacyRequestStatusSchema.optional(),
});
export const AnonymizeLeadInputSchema = z.object({ deleteCrmContact: z.boolean().default(false) });
export const AuditListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) });

type AdminComplaintListQuery = z.infer<typeof AdminComplaintListQuerySchema>;
type AdminPrivacyListQuery = z.infer<typeof AdminPrivacyListQuerySchema>;
type AnonymizeLeadInput = z.infer<typeof AnonymizeLeadInputSchema>;
type ComplaintResponseInput = z.infer<typeof AdminComplaintResponseInputSchema>;
type PrivacyResolutionInput = z.infer<typeof AdminPrivacyResolutionInputSchema>;

function parseId(id: string, onInvalid: () => Error): string {
  if (!IdSchema.safeParse(id).success) {
    throw onInvalid();
  }
  return id;
}

/**
 * Panel de administración (A2, A5, C9, C24). Todo `/internal/*` exige
 * `Authorization: Bearer` de `INTERNAL_API_TOKENS` (guard global del kit) y
 * cada acción queda en `audit_log` con `@Audited`. Único lugar donde se
 * devuelven datos personales descifrados.
 */
@ApiTags('admin')
@ApiBearerAuth()
@ApiHeader({ name: ACTOR_HEADER, required: false, description: 'Correo del usuario del panel (auditoría)' })
@ApiResponse({ status: 401, description: 'UNAUTHORIZED: token de servicio ausente o inválido', schema: ProblemDetailsOpenApi })
@SkipThrottle()
@Controller('internal/admin')
export class AdminController {
  constructor(
    @Inject(ADMIN_LEADS) private readonly adminLeads: AdminLeads,
    @Inject(MANAGE_COMPLAINTS) private readonly complaints: ManageComplaints,
    @Inject(MANAGE_PRIVACY_REQUESTS) private readonly privacyRequests: ManagePrivacyRequests,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('leads')
  @Audited('lead.list', { target: () => null })
  @ApiOperation({ summary: 'Lista de leads con filtros (q: referencia exacta o correo/teléfono exactos por hash)' })
  @ApiResponse({ status: 200, schema: zodToOpenApi(AdminLeadListResponseSchema) })
  async listLeads(
    @Query(new ZodValidationPipe<AdminLeadListQuery>(AdminLeadListQuerySchema)) query: AdminLeadListQuery,
  ): Promise<AdminLeadListResponse> {
    return this.adminLeads.list(query);
  }

  @Get('leads.csv')
  @Audited('lead.export', { target: () => null })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Exporta leads a CSV (UTF-8 con BOM, máximo 10 000 filas)' })
  @ApiResponse({ status: 200, description: 'text/csv; cabecera X-Truncated: true si había más de 10 000 filas' })
  async exportLeads(
    @Query(new ZodValidationPipe<z.infer<typeof AdminLeadExportQuerySchema>>(AdminLeadExportQuerySchema))
    query: z.infer<typeof AdminLeadExportQuerySchema>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const result = await this.adminLeads.exportCsv(query);
    response.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.setHeader('X-Total-Rows', String(result.rows));
    response.setHeader('X-Truncated', String(result.truncated));
    return result.csv;
  }

  @Get('leads/:leadId')
  @Audited('lead.read', { target: 'leadId' })
  @ApiOperation({ summary: 'Detalle de un lead' })
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiResponse({ status: 200, schema: zodToOpenApi(AdminLeadSchema) })
  @ApiResponse({ status: 404, description: 'LEAD_NOT_FOUND', schema: ProblemDetailsOpenApi })
  async getLead(@Param('leadId') leadId: string): Promise<AdminLead> {
    return this.adminLeads.get(parseId(leadId, () => new LeadNotFoundError(leadId)));
  }

  @Post('leads/:leadId/anonymize')
  @HttpCode(200)
  @Audited('lead.anonymize', { target: 'leadId' })
  @ApiOperation({ summary: 'Anonimiza un lead y publica lead.anonymized.v1 (reason admin)' })
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiBody({ schema: zodToOpenApi(AnonymizeLeadInputSchema, 'input') })
  @ApiResponse({
    status: 200,
    schema: { type: 'object', properties: { leadId: { type: 'string' }, anonymized: { type: 'boolean' } } },
  })
  @ApiResponse({ status: 404, description: 'LEAD_NOT_FOUND', schema: ProblemDetailsOpenApi })
  async anonymizeLead(
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe<AnonymizeLeadInput>(AnonymizeLeadInputSchema)) body: AnonymizeLeadInput,
  ): Promise<AnonymizeLeadResult> {
    return this.adminLeads.anonymize(parseId(leadId, () => new LeadNotFoundError(leadId)), body.deleteCrmContact);
  }

  @Get('complaints')
  @Audited('complaint.list', { target: () => null })
  @ApiOperation({ summary: 'Libro de Reclamaciones' })
  @ApiResponse({ status: 200, schema: zodToOpenApi(paginated(AdminComplaintSchema)) })
  async listComplaints(
    @Query(new ZodValidationPipe<AdminComplaintListQuery>(AdminComplaintListQuerySchema)) query: AdminComplaintListQuery,
  ): Promise<{ items: AdminComplaint[]; page: number; pageSize: number; total: number }> {
    return this.complaints.list(query);
  }

  @Post('complaints/:id/response')
  @HttpCode(200)
  @Audited('complaint.respond', { target: 'id' })
  @ApiOperation({ summary: 'Registra la respuesta a un reclamo (estado answered)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: zodToOpenApi(AdminComplaintResponseInputSchema, 'input') })
  @ApiResponse({ status: 200, schema: zodToOpenApi(AdminComplaintSchema) })
  @ApiResponse({ status: 404, description: 'COMPLAINT_NOT_FOUND', schema: ProblemDetailsOpenApi })
  async respondComplaint(
    @Param('id') id: string,
    @Body(new ZodValidationPipe<ComplaintResponseInput>(AdminComplaintResponseInputSchema)) body: ComplaintResponseInput,
    @InternalActor() actor: string | null,
  ): Promise<AdminComplaint> {
    return this.complaints.respond(parseId(id, () => new ComplaintNotFoundError(id)), body.response, actor);
  }

  @Get('privacy-requests')
  @Audited('privacy.list', { target: () => null })
  @ApiOperation({ summary: 'Solicitudes ARCO' })
  @ApiResponse({ status: 200, schema: zodToOpenApi(paginated(AdminPrivacyRequestSchema)) })
  async listPrivacyRequests(
    @Query(new ZodValidationPipe<AdminPrivacyListQuery>(AdminPrivacyListQuerySchema)) query: AdminPrivacyListQuery,
  ): Promise<{ items: AdminPrivacyRequest[]; page: number; pageSize: number; total: number }> {
    return this.privacyRequests.list(query);
  }

  @Post('privacy-requests/:id/resolution')
  @HttpCode(200)
  @Audited('privacy.resolve', { target: 'id' })
  @ApiOperation({
    summary: 'Resuelve una solicitud ARCO; con anonymizeLeads (cancelación/oposición/revocación) anonimiza sus leads',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: zodToOpenApi(AdminPrivacyResolutionInputSchema, 'input') })
  @ApiResponse({ status: 200, schema: zodToOpenApi(AdminPrivacyRequestSchema) })
  @ApiResponse({ status: 404, description: 'PRIVACY_REQUEST_NOT_FOUND', schema: ProblemDetailsOpenApi })
  async resolvePrivacyRequest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe<PrivacyResolutionInput>(AdminPrivacyResolutionInputSchema)) body: PrivacyResolutionInput,
    @InternalActor() actor: string | null,
  ): Promise<AdminPrivacyRequest & { anonymizedLeads: number }> {
    return this.privacyRequests.resolve(parseId(id, () => new PrivacyRequestNotFoundError(id)), body, actor);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Últimas entradas de auditoría' })
  @ApiResponse({ status: 200, schema: { type: 'array', items: zodToOpenApi(AuditEntrySchema) } })
  async listAudit(
    @Query(new ZodValidationPipe<z.infer<typeof AuditListQuerySchema>>(AuditListQuerySchema))
    query: z.infer<typeof AuditListQuerySchema>,
  ): Promise<AuditEntry[]> {
    return this.audit.list(query.limit);
  }
}
