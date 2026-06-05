import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { DraftInvoiceSearchV2Dto } from '../dto/draft-invoice-search-v2.dto';
import { SearchDraftInvoicesV2Query } from '../queries/search-draft-invoices-v2.query';

@Controller('invoices')
@UseGuards(PermissionGuard)
export class DraftInvoiceV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('drafts/search')
  @Version('2')
  @RequirePermission('pos.invoice.read')
  search(
    @Body() dto: DraftInvoiceSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchDraftInvoicesV2Query(dto, actor));
  }
}
