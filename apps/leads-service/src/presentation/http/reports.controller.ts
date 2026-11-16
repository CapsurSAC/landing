import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  BrandSchema,
  DailyReportSchema,
  FunnelReportQuerySchema,
  FunnelReportSchema,
  type DailyReport,
  type FunnelReport,
  type FunnelReportQuery,
} from '@capsur/api-contracts';
import { ZodValidationPipe } from '@capsur/nest-kit';
import { z } from 'zod';
import type { BuildDailyReport, BuildFunnelReport } from '../../application/use-cases/reports';
import { BUILD_DAILY_REPORT, BUILD_FUNNEL_REPORT } from '../../application/use-cases/tokens';
import { isIsoDate, limaDateOf, previousIsoDate } from '../../domain/lima-calendar';
import { ProblemDetailsOpenApi, zodToOpenApi } from './openapi';

const MAX_FUNNEL_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export const FunnelQuerySchema = FunnelReportQuerySchema.refine((query) => Date.parse(query.from) < Date.parse(query.to), {
  path: ['to'],
  message: '`to` debe ser posterior a `from`',
}).refine((query) => Date.parse(query.to) - Date.parse(query.from) <= MAX_FUNNEL_RANGE_MS, {
  path: ['to'],
  message: 'El rango máximo es de un año',
});

export const DailyReportQuerySchema = z.object({
  brand: BrandSchema.default('sis'),
  date: z
    .string()
    .refine(isIsoDate, 'Debe ser una fecha YYYY-MM-DD')
    .optional()
    .describe('Día civil de Lima; por defecto, ayer'),
});
type DailyReportQuery = z.infer<typeof DailyReportQuerySchema>;

/** Embudo (A16) y reporte diario (A20). Rutas internas con token de servicio. */
@ApiTags('reports')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'UNAUTHORIZED', schema: ProblemDetailsOpenApi })
@SkipThrottle()
@Controller('internal/reports')
export class ReportsController {
  constructor(
    @Inject(BUILD_FUNNEL_REPORT) private readonly funnelReport: BuildFunnelReport,
    @Inject(BUILD_DAILY_REPORT) private readonly dailyReport: BuildDailyReport,
  ) {}

  @Get('funnel')
  @ApiOperation({ summary: 'Embudo: sesiones únicas por paso, CRM, promoción, campaña, origen, experimentos y serie diaria' })
  @ApiResponse({ status: 200, schema: zodToOpenApi(FunnelReportSchema) })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED', schema: ProblemDetailsOpenApi })
  async funnel(@Query(new ZodValidationPipe<FunnelReportQuery>(FunnelQuerySchema)) query: FunnelReportQuery): Promise<FunnelReport> {
    return this.funnelReport.execute(query);
  }

  @Get('daily')
  @ApiOperation({ summary: 'Reporte de un día (America/Lima): leads, duplicados, CRM y lo más pedido' })
  @ApiResponse({ status: 200, schema: zodToOpenApi(DailyReportSchema) })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED', schema: ProblemDetailsOpenApi })
  async daily(@Query(new ZodValidationPipe<DailyReportQuery>(DailyReportQuerySchema)) query: DailyReportQuery): Promise<DailyReport> {
    return this.dailyReport.execute(query.brand, query.date ?? previousIsoDate(limaDateOf(new Date())));
  }
}
