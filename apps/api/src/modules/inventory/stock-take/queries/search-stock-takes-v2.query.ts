import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { StockTakeSearchV2Dto } from '../dto/stock-take-search-v2.dto';

export class SearchStockTakesV2Query {
  constructor(
    public readonly dto: StockTakeSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
