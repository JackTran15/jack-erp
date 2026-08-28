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
import { DebtReportExportDto } from './dto/debt-report-export.dto';
import { debtReportLabel } from './queries/get-debt-report-document.handler';
import { GetDebtReportDocumentQuery } from './queries/get-debt-report-document.query';
import {
  ReportDocumentPayload,
  TemplateScope,
} from '@erp/shared-interfaces';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { CreateDebtReportTemplateCommand } from './commands/create-debt-report-template.command';
import { DeleteDebtReportTemplateCommand } from './commands/delete-debt-report-template.command';
import { UpdateDebtReportTemplateCommand } from './commands/update-debt-report-template.command';
import { CreateDebtReportTemplateDto } from './dto/create-debt-report-template.dto';
import { DebtReportSearchDto } from './dto/debt-report-search.dto';
import { ReportFilterOptionsQueryDto } from './dto/report-filter-options-query.dto';
import { UpdateDebtReportTemplateDto } from './dto/update-debt-report-template.dto';
import { GetDebtReportColumnsQuery } from './queries/get-debt-report-columns.query';
import { GetDebtReportTemplateQuery } from './queries/get-debt-report-template.query';
import { GetReportFilterOptionsQuery } from './queries/get-report-filter-options.query';
import { ListDebtReportTemplatesQuery } from './queries/list-debt-report-templates.query';
import { SearchDebtReportQuery } from './queries/search-debt-report.query';

const DEBTS_READ = 'reporting.debts.read';

@ApiTags('reports/debts')
@Controller('reports/debts')
@UseGuards(PermissionGuard)
export class DebtReportController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly exportService: ReportExportService,
  ) {}

  @Get('columns')
  @RequirePermission(DEBTS_READ)
  getColumns(
    @Query('reportType') reportType: string,
    @Actor() actor: ActorContext,
    @Query('groupBy') groupBy?: 'item' | 'productTemplate',
  ) {
    return this.queryBus.execute(
      new GetDebtReportColumnsQuery(reportType, actor, groupBy),
    );
  }

  /** Shared dropdown options for the report filters (customerGroup, supplier, …). */
  @Get('filter-options')
  @RequirePermission(DEBTS_READ)
  getFilterOptions(
    @Query() dto: ReportFilterOptionsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new GetReportFilterOptionsQuery(dto, actor));
  }

  @Post('search')
  @RequirePermission(DEBTS_READ)
  search(@Body() dto: DebtReportSearchDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchDebtReportQuery(dto, actor));
  }

  @Get('templates')
  @RequirePermission(DEBTS_READ)
  listTemplates(
    @Actor() actor: ActorContext,
    @Query('reportType') reportType?: string,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.queryBus.execute(
      new ListDebtReportTemplatesQuery(actor, reportType, scope),
    );
  }

  @Get('templates/:id')
  @RequirePermission(DEBTS_READ)
  getTemplate(
    @Param('id') id: string,
    @Actor() actor: ActorContext,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.queryBus.execute(
      new GetDebtReportTemplateQuery(id, actor, scope),
    );
  }

  @Post('templates')
  @RequirePermission(DEBTS_READ)
  createTemplate(
    @Body() dto: CreateDebtReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(new CreateDebtReportTemplateCommand(dto, actor));
  }

  @Patch('templates/:id')
  @RequirePermission(DEBTS_READ)
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateDebtReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(
      new UpdateDebtReportTemplateCommand(id, dto, actor),
    );
  }

  @Delete('templates/:id')
  @RequirePermission(DEBTS_READ)
  deleteTemplate(
    @Param('id') id: string,
    @Actor() actor: ActorContext,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.commandBus.execute(
      new DeleteDebtReportTemplateCommand(id, actor, scope),
    );
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(DEBTS_READ)
  @ApiOperation({ summary: 'Export one debt report as an .xlsx workbook' })
  async export(
    @Body() dto: DebtReportExportDto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    // Prepare first: everything that can still answer with a 4xx happens
    // before the sink writes a header byte (ADR-08).
    const prepared = await this.queryBus.execute<
      GetDebtReportDocumentQuery,
      PreparedExport
    >(new GetDebtReportDocumentQuery(dto, actor));
    const label = debtReportLabel(dto.reportType);
    const written = await new ExportPipeline(
      prepared.fetcher,
      new XlsxStreamWriter(label),
      new HttpResponseSink(res, label),
    ).run(prepared.header, prepared.columns);
    prepared.onComplete(written);
  }

  @Post('print-payload')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(DEBTS_READ)
  @ApiOperation({ summary: 'Print-ready payload for one debt report' })
  async printPayload(
    @Body() dto: DebtReportExportDto,
    @Actor() actor: ActorContext,
  ): Promise<ReportDocumentPayload> {
    const prepared = await this.queryBus.execute<
      GetDebtReportDocumentQuery,
      PreparedExport
    >(new GetDebtReportDocumentQuery(dto, actor));
    return this.exportService.materialize(prepared);
  }
}
