import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryStockBalanceSearchV2Dto } from '../dto/inventory-stock-balance-search-v2.dto';

export class SearchInventoryStockBalancesV2Query {
  constructor(
    public readonly dto: InventoryStockBalanceSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
