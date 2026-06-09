import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryItemUnitSearchV2Dto } from '../dto/inventory-item-unit-search-v2.dto';

export class SearchInventoryItemUnitsV2Query {
  constructor(
    public readonly dto: InventoryItemUnitSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
