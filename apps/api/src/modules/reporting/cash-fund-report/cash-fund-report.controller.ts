import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Response } from 'express';
import {
  REPORT_DOMAIN_PERMISSIONS,
  ReportDocumentPayload,
  TemplateScope,
} from '@erp/shared-interfaces';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { ExportPipeline } from '../report-core/export/export-pipeline';
import { HttpResponseSink } from '../report-core/export/http-response.sink';
import { XlsxStreamWriter } from '../report-core/export/xlsx-stream.writer';
import {
  PreparedExport,
  ReportExportService,
} from '../report-core/report-export.service';
import { ReportPermissionGuard } from '../report-core/report-permission.guard';
import { CreateCashFundReportTemplateCommand } from './commands/create-cash-fund-report-template.command';
import { DeleteCashFundReportTemplateCommand } from './commands/delete-cash-fund-report-template.command';
import { UpdateCashFundReportTemplateCommand } from './commands/update-cash-fund-report-template.command';
import { CashFundReportExportDto } from './dto/cash-fund-report-export.dto';
import { CashFundReportSearchDto } from './dto/cash-fund-report-search.dto';
import { CreateCashFundReportTemplateDto } from './dto/create-cash-fund-report-template.dto';
import { ReportFilterOptionsQueryDto } from './dto/report-filter-options-query.dto';
import { UpdateCashFundReportTemplateDto } from './dto/update-cash-fund-report-template.dto';
import { GetCashFundReportColumnsQuery } from './queries/get-cash-fund-report-columns.query';
import { cashFundReportLabel } from './queries/get-cash-fund-report-document.handler';
import { GetCashFundReportDocumentQuery } from './queries/get-cash-fund-report-document.query';
import { GetCashFundReportTemplateQuery } from './queries/get-cash-fund-report-template.query';
import { GetReportFilterOptionsQuery } from './queries/get-report-filter-options.query';
import { ListCashFundReportTemplatesQuery } from './queries/list-cash-fund-report-templates.query';
import { SearchCashFundReportQuery } from './queries/search-cash-fund-report.query';

/** Opens the screen; `ReportPermissionGuard` narrows to the requested report. */
const CASH_READ = REPORT_DOMAIN_PERMISSIONS.cash.floor;

@ApiTags('reports/cash-fund')
@Controller('reports/cash-fund')
@UseGuards(PermissionGuard, ReportPermissionGuard)
export class CashFundReportController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly exportService: ReportExportService,
  ) {}

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

  @Get('templates')
  @RequirePermission(CASH_READ)
  listTemplates(
    @Actor() actor: ActorContext,
    @Query('reportType') reportType?: string,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.queryBus.execute(
      new ListCashFundReportTemplatesQuery(actor, reportType, scope),
    );
  }

  @Get('templates/:id')
  @RequirePermission(CASH_READ)
  getTemplate(
    @Param('id') id: string,
    @Actor() actor: ActorContext,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.queryBus.execute(
      new GetCashFundReportTemplateQuery(id, actor, scope),
    );
  }

  @Post('templates')
  @RequirePermission(CASH_READ)
  createTemplate(
    @Body() dto: CreateCashFundReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(
      new CreateCashFundReportTemplateCommand(dto, actor),
    );
  }

  @Patch('templates/:id')
  @RequirePermission(CASH_READ)
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateCashFundReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(
      new UpdateCashFundReportTemplateCommand(id, dto, actor),
    );
  }

  @Delete('templates/:id')
  @RequirePermission(CASH_READ)
  deleteTemplate(
    @Param('id') id: string,
    @Actor() actor: ActorContext,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.commandBus.execute(
      new DeleteCashFundReportTemplateCommand(id, actor, scope),
    );
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(CASH_READ)
  @ApiOperation({ summary: 'Export one cash-fund report as an .xlsx workbook' })
  async export(
    @Body() dto: CashFundReportExportDto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    // Prepare first: everything that can still answer with a 4xx happens
    // before the sink writes a header byte (ADR-08).
    const prepared = await this.queryBus.execute<
      GetCashFundReportDocumentQuery,
      PreparedExport
    >(new GetCashFundReportDocumentQuery(dto, actor));
    const label = cashFundReportLabel(dto.reportType);
    const written = await new ExportPipeline(
      prepared.fetcher,
      new XlsxStreamWriter(label),
      new HttpResponseSink(res, label),
    ).run(prepared.header, prepared.columns);
    prepared.onComplete(written);
  }

  @Post('print-payload')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(CASH_READ)
  @ApiOperation({ summary: 'Print-ready payload for one cash-fund report' })
  async printPayload(
    @Body() dto: CashFundReportExportDto,
    @Actor() actor: ActorContext,
  ): Promise<ReportDocumentPayload> {
    const prepared = await this.queryBus.execute<
      GetCashFundReportDocumentQuery,
      PreparedExport
    >(new GetCashFundReportDocumentQuery(dto, actor));
    return this.exportService.materialize(prepared);
  }
}
