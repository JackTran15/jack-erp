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
  ) {
    return this.queryBus.execute(new ListDebtReportTemplatesQuery(actor, reportType));
  }

  @Get('templates/:id')
  @RequirePermission(DEBTS_READ)
  getTemplate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new GetDebtReportTemplateQuery(id, actor));
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
  deleteTemplate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.commandBus.execute(new DeleteDebtReportTemplateCommand(id, actor));
  }
}
