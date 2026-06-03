import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { GoodsReceiptSearchV2Dto } from '../dto/goods-receipt-search-v2.dto';

export class SearchGoodsReceiptsV2Query {
  constructor(
    public readonly dto: GoodsReceiptSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
