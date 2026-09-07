import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { GoodsReceiptLineSearchV2Dto } from '../dto/goods-receipt-line-search-v2.dto';

export class SearchGoodsReceiptLinesV2Query {
  constructor(
    public readonly goodsReceiptId: string,
    public readonly dto: GoodsReceiptLineSearchV2Dto,
    public readonly actor: ActorContext,
    /**
     * Drop the branch predicate from the voucher lookup — the mirror of
     * {@link SearchGoodsIssueLinesV2Query.skipBranchScope}. Set only by the
     * transfer-order route, which has already authorized the actor's branch as
     * a participant; the receipt belongs to the destination branch, so the
     * source branch reading it would otherwise 404.
     */
    public readonly skipBranchScope = false,
  ) {}
}
