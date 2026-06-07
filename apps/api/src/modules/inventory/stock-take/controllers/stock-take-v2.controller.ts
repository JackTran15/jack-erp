import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { StockTakeSearchV2Dto } from '../dto/stock-take-search-v2.dto';
import { SearchStockTakesV2Query } from '../queries/search-stock-takes-v2.query';

/** `POST /v2/inventory/stock-takes/search` — server-side CQRS search for the Kiểm kê kho list. */
@Controller('inventory/stock-takes')
@UseGuards(PermissionGuard)
export class StockTakeV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.read')
  search(@Body() dto: StockTakeSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchStockTakesV2Query(dto, actor));
  }
}
