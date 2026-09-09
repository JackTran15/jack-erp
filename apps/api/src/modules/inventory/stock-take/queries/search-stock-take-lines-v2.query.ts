import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { StockTakeLineSearchV2Dto } from '../dto/stock-take-line-search-v2.dto';

export class SearchStockTakeLinesV2Query {
  constructor(
    public readonly stockTakeId: string,
    public readonly dto: StockTakeLineSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
