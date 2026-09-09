import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { StockTransferLineSearchV2Dto } from '../dto/stock-transfer-line-search-v2.dto';

export class SearchStockTransferLinesV2Query {
  constructor(
    public readonly transferId: string,
    public readonly dto: StockTransferLineSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
