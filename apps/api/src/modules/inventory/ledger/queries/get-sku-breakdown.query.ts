import { ActorContext } from "../../../../common/decorators/actor-context.decorator";
import { StockSkuBreakdownDto } from "../dto/stock-sku-breakdown.dto";

export class GetSkuBreakdownQuery {
  constructor(
    public readonly dto: StockSkuBreakdownDto,
    public readonly actor: ActorContext,
  ) {}
}
