import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { PurchaseHistorySearchV2Dto } from '../dto/purchase-history-search-v2.dto';
import { SearchPurchaseHistoryV2Query } from '../queries/search-purchase-history-v2.query';

@Controller('invoices')
@UseGuards(PermissionGuard)
export class PurchaseHistoryV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('purchase-history/search')
  @Version('2')
  @RequirePermission('pos.invoice.read')
  search(
    @Body() dto: PurchaseHistorySearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchPurchaseHistoryV2Query(dto, actor));
  }
}
