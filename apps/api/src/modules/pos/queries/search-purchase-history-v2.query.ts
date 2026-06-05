import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PurchaseHistorySearchV2Dto } from '../dto/purchase-history-search-v2.dto';

export class SearchPurchaseHistoryV2Query {
  constructor(
    public readonly dto: PurchaseHistorySearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
