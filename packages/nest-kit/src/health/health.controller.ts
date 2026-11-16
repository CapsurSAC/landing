import { Controller, Get, Header, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators';
import { HealthService, type HealthReport } from './health.service';

/** `GET /internal/health`: público (lo usa el orquestador), sin rate limit ni caché HTTP. */
@ApiTags('internal')
@Controller('internal')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('health')
  @Public()
  @SkipThrottle()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Salud del servicio y de sus dependencias' })
  @ApiResponse({ status: 200, description: 'ok o degraded' })
  @ApiResponse({ status: 503, description: 'down (dependencia crítica caída)' })
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.health.report();
    response.status(report.status === 'down' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return report;
  }
}
