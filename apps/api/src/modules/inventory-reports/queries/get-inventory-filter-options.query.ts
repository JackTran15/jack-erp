import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryFilterOptionsQueryDto } from '../dto/inventory-filter-options-query.dto';

export class GetInventoryFilterOptionsQuery {
  constructor(
    public readonly dto: InventoryFilterOptionsQueryDto,
    public readonly actor: ActorContext,
  ) {}
}
