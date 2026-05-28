import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { InvoiceSearchV2Dto } from '../dto/invoice-search-v2.dto';
import { SearchInvoicesV2Query } from '../queries/search-invoices-v2.query';

@Controller('invoices')
@UseGuards(PermissionGuard)
export class InvoiceV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  // @RequirePermission('pos.read')
  search(
    @Body() dto: InvoiceSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchInvoicesV2Query(dto, actor));
  }
}
