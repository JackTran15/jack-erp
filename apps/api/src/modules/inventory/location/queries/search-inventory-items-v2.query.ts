import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryItemSearchV2Dto } from '../dto/inventory-item-search-v2.dto';

export class SearchInventoryItemsV2Query {
  constructor(
    public readonly dto: InventoryItemSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
