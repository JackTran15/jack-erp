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
import { ExportPipeline } from '../report-core/export/export-pipeline';
import { HttpResponseSink } from '../report-core/export/http-response.sink';
import { XlsxStreamWriter } from '../report-core/export/xlsx-stream.writer';
import {
  PreparedExport,
  ReportExportService,
} from '../report-core/report-export.service';
import { InvoiceReportExportDto } from './dto/invoice-report-export.dto';
import { invoiceReportLabel } from './queries/get-invoice-report-document.handler';
import { GetInvoiceReportDocumentQuery } from './queries/get-invoice-report-document.query';
import {
  ReportDocumentPayload,
  ReportGroupBy,
  TemplateScope,
} from '@erp/shared-interfaces';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { CreateInvoiceReportTemplateCommand } from './commands/create-invoice-report-template.command';
import { DeleteInvoiceReportTemplateCommand } from './commands/delete-invoice-report-template.command';
import { UpdateInvoiceReportTemplateCommand } from './commands/update-invoice-report-template.command';
import { CreateInvoiceReportTemplateDto } from './dto/create-invoice-report-template.dto';
import { InvoiceReportSearchDto } from './dto/invoice-report-search.dto';
import { ReportFilterOptionsQueryDto } from './dto/report-filter-options-query.dto';
import { UpdateInvoiceReportTemplateDto } from './dto/update-invoice-report-template.dto';
import { GetInvoiceDetailQuery } from './queries/get-invoice-detail.query';
import { GetInvoiceReportColumnsQuery } from './queries/get-invoice-report-columns.query';
import { GetInvoiceReportTemplateQuery } from './queries/get-invoice-report-template.query';
import { GetReportFilterOptionsQuery } from './queries/get-report-filter-options.query';
import { ListInvoiceReportTemplatesQuery } from './queries/list-invoice-report-templates.query';
import { ListInvoiceReportTypesQuery } from './queries/list-invoice-report-types.query';
import { SearchInvoiceReportQuery } from './queries/search-invoice-report.query';

const BRANCH_READ = 'reporting.invoice.branch.read';
// const TEMPLATE_MANAGE = 'reporting.invoice-template.manage';

@ApiTags('reports/invoices')
@Controller('reports/invoices')
@UseGuards(PermissionGuard)
export class InvoiceReportController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly exportService: ReportExportService,
  ) {}

  @Get('types')
  @RequirePermission(BRANCH_READ)
  listTypes(@Actor() actor: ActorContext) {
    return this.queryBus.execute(new ListInvoiceReportTypesQuery(actor));
  }

  @Get('columns')
  @RequirePermission(BRANCH_READ)
  getColumns(
    @Query('reportType') reportType: string,
    @Actor() actor: ActorContext,
    @Query('statBy') statBy?: ReportGroupBy,
    @Query('storeScope') storeScope?: 'all' | 'group',
    @Query('storeIds') storeIds?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(
      new GetInvoiceReportColumnsQuery(
        reportType,
        actor,
        statBy,
        storeScope
          ? { scope: storeScope, storeIds: storeIds ? storeIds.split(',') : [] }
          : undefined,
        branchId,
      ),
    );
  }

  /** Shared dropdown options for the report filters (store, cashier, status, …). */
  @Get('filter-options')
  @RequirePermission(BRANCH_READ)
  getFilterOptions(
    @Query() dto: ReportFilterOptionsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new GetReportFilterOptionsQuery(dto, actor));
  }

  @Post('search')
  @RequirePermission(BRANCH_READ)
  search(@Body() dto: InvoiceReportSearchDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchInvoiceReportQuery(dto, actor));
  }

  /**
   * Full invoice detail (line items + payments) for the drill-down dialog.
   *
   * `id` is what the report rows send and the only unambiguous key: invoice
   * codes are unique per branch, not per organisation. `code` stays supported
   * for the treasury drill-downs, which hold a document number and nothing else.
   */
  @Get('detail')
  @RequirePermission(BRANCH_READ)
  getInvoiceDetail(
    @Actor() actor: ActorContext,
    @Query('code') code?: string,
    @Query('id') id?: string,
  ) {
    return this.queryBus.execute(new GetInvoiceDetailQuery(code!, actor, id));
  }

  @Get('templates')
  @RequirePermission(BRANCH_READ)
  listTemplates(
    @Actor() actor: ActorContext,
    @Query('reportType') reportType?: string,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.queryBus.execute(
      new ListInvoiceReportTemplatesQuery(actor, reportType, scope),
    );
  }

  @Get('templates/:id')
  @RequirePermission(BRANCH_READ)
  getTemplate(
    @Param('id') id: string,
    @Actor() actor: ActorContext,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.queryBus.execute(
      new GetInvoiceReportTemplateQuery(id, actor, scope),
    );
  }

  @Post('templates')
  // @RequirePermission(TEMPLATE_MANAGE)
  createTemplate(
    @Body() dto: CreateInvoiceReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(
      new CreateInvoiceReportTemplateCommand(dto, actor),
    );
  }

  @Patch('templates/:id')
  // @RequirePermission(TEMPLATE_MANAGE)
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(
      new UpdateInvoiceReportTemplateCommand(id, dto, actor),
    );
  }

  @Delete('templates/:id')
  // @RequirePermission(TEMPLATE_MANAGE) // NEED CHECK - maybe allow users to delete their own templates without this permission?
  deleteTemplate(
    @Param('id') id: string,
    @Actor() actor: ActorContext,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.commandBus.execute(
      new DeleteInvoiceReportTemplateCommand(id, actor, scope),
    );
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(BRANCH_READ)
  @ApiOperation({ summary: 'Export one invoice report as an .xlsx workbook' })
  async export(
    @Body() dto: InvoiceReportExportDto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    // Prepare first: everything that can still answer with a 4xx happens
    // before the sink writes a header byte (ADR-08).
    const prepared = await this.queryBus.execute<
      GetInvoiceReportDocumentQuery,
      PreparedExport
    >(new GetInvoiceReportDocumentQuery(dto, actor));
    const label = invoiceReportLabel(dto.reportType);
    const written = await new ExportPipeline(
      prepared.fetcher,
      new XlsxStreamWriter(label),
      new HttpResponseSink(res, label),
    ).run(prepared.header, prepared.columns);
    prepared.onComplete(written);
  }

  @Post('print-payload')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(BRANCH_READ)
  @ApiOperation({ summary: 'Print-ready payload for one invoice report' })
  async printPayload(
    @Body() dto: InvoiceReportExportDto,
    @Actor() actor: ActorContext,
  ): Promise<ReportDocumentPayload> {
    const prepared = await this.queryBus.execute<
      GetInvoiceReportDocumentQuery,
      PreparedExport
    >(new GetInvoiceReportDocumentQuery(dto, actor));
    return this.exportService.materialize(prepared);
  }
}
