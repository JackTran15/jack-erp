import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { StockTransferSearchV2Dto } from '../dto/stock-transfer-search-v2.dto';
import { SearchStockTransfersV2Query } from '../queries/search-stock-transfers-v2.query';

/** `POST /v2/inventory/stock/transfers/search` — server-side CQRS search for the Chuyển kho list. */
@Controller('inventory/stock/transfers')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StockTransferV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.transfer.read')
  @RequireBranchScope()
  search(
    @Body() dto: StockTransferSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchStockTransfersV2Query(dto, actor));
  }
}
