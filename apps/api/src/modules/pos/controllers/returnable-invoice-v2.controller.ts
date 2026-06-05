import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { ReturnableInvoiceSearchV2Dto } from '../dto/returnable-invoice-search-v2.dto';
import { SearchReturnableInvoicesV2Query } from '../queries/search-returnable-invoices-v2.query';

@Controller('invoices')
@UseGuards(PermissionGuard)
export class ReturnableInvoiceV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('returnable/search')
  @Version('2')
  @RequirePermission('pos.invoice.read')
  search(
    @Body() dto: ReturnableInvoiceSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(
      new SearchReturnableInvoicesV2Query(dto, actor),
    );
  }
}
