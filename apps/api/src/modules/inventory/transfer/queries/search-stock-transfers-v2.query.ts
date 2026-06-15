import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { StockTransferSearchV2Dto } from '../dto/stock-transfer-search-v2.dto';

export class SearchStockTransfersV2Query {
  constructor(
    public readonly dto: StockTransferSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
