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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../auth/decorators';
import { PermissionGuard } from '../rbac/permission.guard';
import { CreateInventoryReportTemplateCommand } from './commands/create-inventory-report-template.command';
import { DeleteInventoryReportTemplateCommand } from './commands/delete-inventory-report-template.command';
import { UpdateInventoryReportTemplateCommand } from './commands/update-inventory-report-template.command';
import { CreateInventoryReportTemplateDto } from './dto/create-inventory-report-template.dto';
import { InventoryFilterOptionsQueryDto } from './dto/inventory-filter-options-query.dto';
import { InventoryReportSearchDto } from './dto/inventory-report-search.dto';
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
  ) {}

  @Get('columns')
  @RequirePermission(REPORTS_READ)
  @ApiOperation({ summary: 'Column catalog of one inventory report type' })
  getColumns(
    @Query('reportType') reportType: string,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(
      new GetInventoryReportColumnsQuery(reportType, actor),
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
