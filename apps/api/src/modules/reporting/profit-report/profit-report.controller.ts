import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ReportGroupBy } from '@erp/shared-interfaces';
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
  ) {
    return this.queryBus.execute(
      new ListProfitReportTemplatesQuery(actor, reportType),
    );
  }

  @Get('templates/:id')
  @RequirePermission(PROFIT_READ)
  getTemplate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new GetProfitReportTemplateQuery(id, actor));
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
  deleteTemplate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.commandBus.execute(
      new DeleteProfitReportTemplateCommand(id, actor),
    );
  }
}
