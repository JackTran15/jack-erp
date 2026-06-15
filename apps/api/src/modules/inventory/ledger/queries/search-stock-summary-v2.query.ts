import { ActorContext } from "../../../../common/decorators/actor-context.decorator";
import { StockSummarySearchV2Dto } from "../dto/stock-summary-search-v2.dto";

export class SearchStockSummaryV2Query {
  constructor(
    public readonly dto: StockSummarySearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
