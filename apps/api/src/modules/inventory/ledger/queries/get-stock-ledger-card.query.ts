import { ActorContext } from "../../../../common/decorators/actor-context.decorator";
import { StockLedgerCardDto } from "../dto/stock-ledger-card.dto";

export class GetStockLedgerCardQuery {
  constructor(
    public readonly dto: StockLedgerCardDto,
    public readonly actor: ActorContext,
  ) {}
}
