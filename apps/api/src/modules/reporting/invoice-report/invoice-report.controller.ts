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
import { CreateInvoiceReportTemplateCommand } from './commands/create-invoice-report-template.command';
import { DeleteInvoiceReportTemplateCommand } from './commands/delete-invoice-report-template.command';
import { UpdateInvoiceReportTemplateCommand } from './commands/update-invoice-report-template.command';
import { CreateInvoiceReportTemplateDto } from './dto/create-invoice-report-template.dto';
import { InvoiceReportSearchDto } from './dto/invoice-report-search.dto';
import { UpdateInvoiceReportTemplateDto } from './dto/update-invoice-report-template.dto';
import { GetInvoiceReportColumnsQuery } from './queries/get-invoice-report-columns.query';
import { GetInvoiceReportTemplateQuery } from './queries/get-invoice-report-template.query';
import { ListInvoiceReportTemplatesQuery } from './queries/list-invoice-report-templates.query';
import { ListInvoiceReportTypesQuery } from './queries/list-invoice-report-types.query';
import { SearchInvoiceReportQuery } from './queries/search-invoice-report.query';

// const BRANCH_READ = 'reporting.invoice.branch.read'; // NEED CHECK - maybe allow users with only consolidated read permission to also access branch-level reports?
// const TEMPLATE_MANAGE = 'reporting.invoice-template.manage';

@ApiTags('reports/invoices')
@Controller('reports/invoices')
@UseGuards(PermissionGuard)
export class InvoiceReportController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('types')
  // @RequirePermission(BRANCH_READ)
  listTypes(@Actor() actor: ActorContext) {
    return this.queryBus.execute(new ListInvoiceReportTypesQuery(actor));
  }

  @Get('columns')
  // @RequirePermission(BRANCH_READ)
  getColumns(
    @Query('reportType') reportType: string,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(
      new GetInvoiceReportColumnsQuery(reportType, actor),
    );
  }

  @Post('search')
  // @RequirePermission(BRANCH_READ)
  search(@Body() dto: InvoiceReportSearchDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchInvoiceReportQuery(dto, actor));
  }

  @Get('templates')
  // @RequirePermission(BRANCH_READ)
  listTemplates(
    @Actor() actor: ActorContext,
    @Query('reportType') reportType?: string,
  ) {
    return this.queryBus.execute(
      new ListInvoiceReportTemplatesQuery(actor, reportType),
    );
  }

  @Get('templates/:id')
  // @RequirePermission(BRANCH_READ)
  getTemplate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new GetInvoiceReportTemplateQuery(id, actor));
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
  deleteTemplate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.commandBus.execute(
      new DeleteInvoiceReportTemplateCommand(id, actor),
    );
  }
}
