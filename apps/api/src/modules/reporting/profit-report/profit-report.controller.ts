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
import { ProfitReportExportDto } from './dto/profit-report-export.dto';
import { profitReportLabel } from './queries/get-profit-report-document.handler';
import { GetProfitReportDocumentQuery } from './queries/get-profit-report-document.query';
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
import { CreateProfitReportTemplateCommand } from './commands/create-profit-report-template.command';
import { DeleteProfitReportTemplateCommand } from './commands/delete-profit-report-template.command';
import { UpdateProfitReportTemplateCommand } from './commands/update-profit-report-template.command';
import { CreateProfitReportTemplateDto } from './dto/create-profit-report-template.dto';
import { ProfitReportSearchDto } from './dto/profit-report-search.dto';
import { ReportFilterOptionsQueryDto } from './dto/report-filter-options-query.dto';
import { UpdateProfitReportTemplateDto } from './dto/update-profit-report-template.dto';
import { GetProfitReportColumnsQuery } from './queries/get-profit-report-columns.query';
import { GetProfitReportTemplateQuery } from './queries/get-profit-report-template.query';
import { GetReportFilterOptionsQuery } from './queries/get-report-filter-options.query';
import { ListProfitReportTemplatesQuery } from './queries/list-profit-report-templates.query';
import { SearchProfitReportQuery } from './queries/search-profit-report.query';

const PROFIT_READ = 'reporting.profit.read';

@ApiTags('reports/profit')
@Controller('reports/profit')
@UseGuards(PermissionGuard)
export class ProfitReportController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly exportService: ReportExportService,
  ) {}

  @Get('columns')
  @RequirePermission(PROFIT_READ)
  getColumns(
    @Query('reportType') reportType: string,
    @Actor() actor: ActorContext,
    @Query('statBy') statBy?: ReportGroupBy,
  ) {
    return this.queryBus.execute(
      new GetProfitReportColumnsQuery(reportType, actor, statBy),
    );
  }

  /** Shared dropdown options for the report filters (store, productGroup). */
  @Get('filter-options')
  @RequirePermission(PROFIT_READ)
  getFilterOptions(
    @Query() dto: ReportFilterOptionsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new GetReportFilterOptionsQuery(dto, actor));
  }

  @Post('search')
  @RequirePermission(PROFIT_READ)
  search(@Body() dto: ProfitReportSearchDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchProfitReportQuery(dto, actor));
  }

  @Get('templates')
  @RequirePermission(PROFIT_READ)
  listTemplates(
    @Actor() actor: ActorContext,
    @Query('reportType') reportType?: string,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.queryBus.execute(
      new ListProfitReportTemplatesQuery(actor, reportType, scope),
    );
  }

  @Get('templates/:id')
  @RequirePermission(PROFIT_READ)
  getTemplate(
    @Param('id') id: string,
    @Actor() actor: ActorContext,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.queryBus.execute(
      new GetProfitReportTemplateQuery(id, actor, scope),
    );
  }

  @Post('templates')
  @RequirePermission(PROFIT_READ)
  createTemplate(
    @Body() dto: CreateProfitReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(
      new CreateProfitReportTemplateCommand(dto, actor),
    );
  }

  @Patch('templates/:id')
  @RequirePermission(PROFIT_READ)
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateProfitReportTemplateDto,
    @Actor() actor: ActorContext,
  ) {
    return this.commandBus.execute(
      new UpdateProfitReportTemplateCommand(id, dto, actor),
    );
  }

  @Delete('templates/:id')
  @RequirePermission(PROFIT_READ)
  deleteTemplate(
    @Param('id') id: string,
    @Actor() actor: ActorContext,
    @Query('scope') scope?: TemplateScope,
  ) {
    return this.commandBus.execute(
      new DeleteProfitReportTemplateCommand(id, actor, scope),
    );
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PROFIT_READ)
  @ApiOperation({ summary: 'Export one profit report as an .xlsx workbook' })
  async export(
    @Body() dto: ProfitReportExportDto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    // Prepare first: everything that can still answer with a 4xx happens
    // before the sink writes a header byte (ADR-08).
    const prepared = await this.queryBus.execute<
      GetProfitReportDocumentQuery,
      PreparedExport
    >(new GetProfitReportDocumentQuery(dto, actor));
    const label = profitReportLabel(dto.reportType);
    const written = await new ExportPipeline(
      prepared.fetcher,
      new XlsxStreamWriter(label),
      new HttpResponseSink(res, label),
    ).run(prepared.header, prepared.columns);
    prepared.onComplete(written);
  }

  @Post('print-payload')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PROFIT_READ)
  @ApiOperation({ summary: 'Print-ready payload for one profit report' })
  async printPayload(
    @Body() dto: ProfitReportExportDto,
    @Actor() actor: ActorContext,
  ): Promise<ReportDocumentPayload> {
    const prepared = await this.queryBus.execute<
      GetProfitReportDocumentQuery,
      PreparedExport
    >(new GetProfitReportDocumentQuery(dto, actor));
    return this.exportService.materialize(prepared);
  }
}
