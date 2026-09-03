import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { GoodsReceiptLineSearchV2Dto } from '../dto/goods-receipt-line-search-v2.dto';

export class SearchGoodsReceiptLinesV2Query {
  constructor(
    public readonly goodsReceiptId: string,
    public readonly dto: GoodsReceiptLineSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
