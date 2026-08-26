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
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Response } from 'express';
import {
  INVENTORY_REPORT_VIEW_MODES,
  InventoryReportStatBy,
  InventoryReportViewMode,
  ReportDocumentPayload,
} from '@erp/shared-interfaces';
import { ExportPipeline } from '../reporting/report-core/export/export-pipeline';
import { HttpResponseSink } from '../reporting/report-core/export/http-response.sink';
import { XlsxStreamWriter } from '../reporting/report-core/export/xlsx-stream.writer';
import {
  PreparedExport,
  ReportExportService,
} from '../reporting/report-core/report-export.service';
import {
  Actor,
  ActorContext,
} from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import { ITEM_GROUP_BY_VALUES } from './services/stock-period.service';
import { CreateInventoryReportTemplateCommand } from './commands/create-inventory-report-template.command';
import { DeleteInventoryReportTemplateCommand } from './commands/delete-inventory-report-template.command';
import { UpdateInventoryReportTemplateCommand } from './commands/update-inventory-report-template.command';
import { CreateInventoryReportTemplateDto } from './dto/create-inventory-report-template.dto';
import { InventoryFilterOptionsQueryDto } from './dto/inventory-filter-options-query.dto';
import { InventoryReportExportDto } from './dto/inventory-report-export.dto';
import { InventoryReportSearchDto } from './dto/inventory-report-search.dto';
import { inventoryReportLabel } from './queries/get-inventory-report-document.handler';
import { GetInventoryReportDocumentQuery } from './queries/get-inventory-report-document.query';
import { UpdateInventoryReportTemplateDto } from './dto/update-inventory-report-template.dto';
import { GetInventoryFilterOptionsQuery } from './queries/get-inventory-filter-options.query';
import { GetInventoryReportColumnsQuery } from './queries/get-inventory-report-columns.query';
import { GetInventoryReportTemplateQuery } from './queries/get-inventory-report-template.query';
import { ListInventoryReportTemplatesQuery } from './queries/list-inventory-report-templates.query';
import { SearchInventoryReportQuery } from './queries/search-inventory-report.query';

const REPORTS_READ = 'inventory.reports.read';

/**
 * Registry-driven inventory report contract (columns / search /
 * filter-options), mirroring the invoice report surface. The legacy GET
 * report endpoints in `InventoryReportsController` stay untouched.
 * Reads aggregate across branches via `filters.store`, so no
 * `@RequireBranchScope()` (no `X-Branch-Id` header required).
 */
@ApiTags('inventory-reports')
@Controller('reports/inventory')
@UseGuards(PermissionGuard)
export class InventoryReportV2Controller {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly exportService: ReportExportService,
  ) {}

  @Get('columns')
  @RequirePermission(REPORTS_READ)
  @ApiOperation({ summary: 'Column catalog of one inventory report type' })
  @ApiQuery({ name: 'viewMode', enum: INVENTORY_REPORT_VIEW_MODES, required: false })
  @ApiQuery({ name: 'statBy', enum: ITEM_GROUP_BY_VALUES, required: false })
  getColumns(
    @Query('reportType') reportType: string,
    @Actor() actor: ActorContext,
    @Query('viewMode') viewMode?: InventoryReportViewMode,
    @Query('statBy') statBy?: InventoryReportStatBy,
  ) {
    return this.queryBus.execute(
      new GetInventoryReportColumnsQuery(reportType, actor, { viewMode, statBy }),
    );
  }

  @Get('filter-options')
  @RequirePermission(REPORTS_READ)
  @ApiOperation({ summary: 'Dropdown options for the report filters' })
  getFilterOptions(
    @Query() dto: InventoryFilterOptionsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new GetInventoryFilterOptionsQuery(dto, actor));
  }

  @Post('search')
  @RequirePermission(REPORTS_READ)
  @ApiOperation({ summary: 'Run one inventory report (keyed rows + totals)' })
  search(@Body() dto: InventoryReportSearchDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchInventoryReportQuery(dto, actor));
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(REPORTS_READ)
  @ApiOperation({ summary: 'Export one inventory report as an .xlsx workbook' })
  async export(
    @Body() dto: InventoryReportExportDto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    // Prepare first: everything that can still answer with a 4xx happens
    // before the sink writes a header byte (ADR-08).
    const prepared = await this.queryBus.execute<
      GetInventoryReportDocumentQuery,
      PreparedExport
    >(new GetInventoryReportDocumentQuery(dto, actor));
    const label = inventoryReportLabel(dto.reportType);
    const written = await new ExportPipeline(
      prepared.fetcher,
      new XlsxStreamWriter(label),
      new HttpResponseSink(res, label),
    ).run(prepared.header, prepared.columns);
    prepared.onComplete(written);
  }

  @Post('print-payload')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(REPORTS_READ)
  @ApiOperation({ summary: 'Print-ready payload for one inventory report' })
  async printPayload(
    @Body() dto: InventoryReportExportDto,
    @Actor() actor: ActorContext,
  ): Promise<ReportDocumentPayload> {
    const prepared = await this.queryBus.execute<
      GetInventoryReportDocumentQuery,
      PreparedExport
    >(new GetInventoryReportDocumentQuery(dto, actor));
    return this.exportService.materialize(prepared);
  }

  @Get('templates')
  @RequirePermission(REPORTS_READ)
  @ApiOperation({ summary: 'List saved inventory report templates' })
  listTemplates(
    @Actor() actor: ActorContext,
    @Query('reportType') reportType?: string,
  ) {
    return this.queryBus.execute(
      new ListInventoryReportTemplatesQuery(actor, reportType),
    );
  }

  @Get('templates/:id')
  @RequirePermission(REPORTS_READ)
  getTemplate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.queryBus.execute(
      new GetInventoryReportTemplateQuery(id, actor),
    );
  }

  @Post('templates')
  @RequirePermission(REPORTS_READ)
  createTemplate(
    @Body() dto: CreateInventoryReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(
      new CreateInventoryReportTemplateCommand(dto, actor),
    );
  }

  @Patch('templates/:id')
  @RequirePermission(REPORTS_READ)
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(
      new UpdateInventoryReportTemplateCommand(id, dto, actor),
    );
  }

  @Delete('templates/:id')
  @RequirePermission(REPORTS_READ)
  deleteTemplate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.commandBus.execute(
      new DeleteInventoryReportTemplateCommand(id, actor),
    );
  }
}
