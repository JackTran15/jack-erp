import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import { ReportingService, ReportQuery } from './reporting.service';
import { AsyncReportService, AsyncReportType } from './async-report.service';
import { ReportQueryDto, AsyncReportDto } from './dto';

@Controller('reports')
@UseGuards(PermissionGuard)
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly asyncReportService: AsyncReportService,
  ) {}

  @Get('dashboard')
  @RequirePermission('reporting.dashboard.branch.read')
  getDashboard(
    @Query() query: ReportQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.reportingService.getDashboard(
      this.toReportQuery(query),
      actor,
    );
  }

  @Get('sales-summary')
  @RequirePermission('reporting.dashboard.branch.read')
  getSalesSummary(
    @Query() query: ReportQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.reportingService.getSalesSummary(
      this.toReportQuery(query),
      actor,
    );
  }

  @Get('inventory-valuation')
  @RequirePermission('reporting.dashboard.branch.read')
  getInventoryValuation(
    @Query() query: ReportQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.reportingService.getInventoryValuation(
      this.toReportQuery(query),
      actor,
    );
  }

  @Get('receivables-aging')
  @RequirePermission('reporting.dashboard.branch.read')
  getReceivablesAging(
    @Query() query: ReportQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.reportingService.getReceivablesAging(
      this.toReportQuery(query),
      actor,
    );
  }

  @Get('payables-aging')
  @RequirePermission('reporting.dashboard.branch.read')
  getPayablesAging(
    @Query() query: ReportQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.reportingService.getPayablesAging(
      this.toReportQuery(query),
      actor,
    );
  }

  @Get('cash-reconciliation')
  @RequirePermission('reporting.dashboard.branch.read')
  getCashReconciliation(
    @Query() query: ReportQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.reportingService.getCashReconciliation(
      this.toReportQuery(query),
      actor,
    );
  }

  @Post('async')
  @RequirePermission('reporting.dashboard.branch.read')
  runAsyncReport(
    @Body() dto: AsyncReportDto,
    @Actor() actor: ActorContext,
  ) {
    return this.asyncReportService.runAsyncReport(
      dto.type as AsyncReportType,
      this.toReportQuery(dto),
      actor,
    );
  }

  @Get('async/:jobId')
  @RequirePermission('reporting.dashboard.branch.read')
  checkJobStatus(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.asyncReportService.checkJobStatus(jobId);
  }

  private toReportQuery(dto: ReportQueryDto | AsyncReportDto): ReportQuery {
    return {
      branchId: dto.branchId,
      dateRange:
        dto.startDate && dto.endDate
          ? { startDate: dto.startDate, endDate: dto.endDate }
          : undefined,
    };
  }
}
