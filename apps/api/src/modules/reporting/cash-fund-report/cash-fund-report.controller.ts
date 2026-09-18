import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import { REPORT_DOMAIN_PERMISSIONS } from '@erp/shared-interfaces';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { ReportPermissionGuard } from '../report-core/report-permission.guard';
import { CashFundReportSearchDto } from './dto/cash-fund-report-search.dto';
import { ReportFilterOptionsQueryDto } from './dto/report-filter-options-query.dto';
import { GetCashFundReportColumnsQuery } from './queries/get-cash-fund-report-columns.query';
import { GetReportFilterOptionsQuery } from './queries/get-report-filter-options.query';
import { SearchCashFundReportQuery } from './queries/search-cash-fund-report.query';

/** Opens the screen; `ReportPermissionGuard` narrows to the requested report. */
const CASH_READ = REPORT_DOMAIN_PERMISSIONS.cash.floor;

@ApiTags('reports/cash-fund')
@Controller('reports/cash-fund')
@UseGuards(PermissionGuard, ReportPermissionGuard)
export class CashFundReportController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('columns')
  @RequirePermission(CASH_READ)
  getColumns(@Query('reportType') reportType: string, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new GetCashFundReportColumnsQuery(reportType, actor));
  }

  /** Shared dropdown options for the report filters (store, employee, paymentMethod, expenseCategory). */
  @Get('filter-options')
  @RequirePermission(CASH_READ)
  getFilterOptions(
    @Query() dto: ReportFilterOptionsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new GetReportFilterOptionsQuery(dto, actor));
  }

  @Post('search')
  @RequirePermission(CASH_READ)
  search(@Body() dto: CashFundReportSearchDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchCashFundReportQuery(dto, actor));
  }
}
