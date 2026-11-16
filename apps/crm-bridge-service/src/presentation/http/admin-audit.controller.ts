import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { type AuditEntry, AuditService, ZodValidationPipe } from '@capsur/nest-kit';
import { type AuditQuery, AuditQuerySchema } from './schemas';

/** `GET /internal/admin/audit?limit=` (C24): últimas acciones internas auditadas. */
@ApiExcludeController()
@Controller('internal/admin')
export class AdminAuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get('audit')
  async list(@Query(new ZodValidationPipe(AuditQuerySchema)) query: AuditQuery): Promise<{ items: AuditEntry[] }> {
    return { items: await this.audit.list(query.limit) };
  }
}
