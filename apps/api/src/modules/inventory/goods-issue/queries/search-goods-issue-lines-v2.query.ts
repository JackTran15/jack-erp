import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { GoodsIssueLineSearchV2Dto } from '../dto/goods-issue-line-search-v2.dto';

export class SearchGoodsIssueLinesV2Query {
  constructor(
    public readonly goodsIssueId: string,
    public readonly dto: GoodsIssueLineSearchV2Dto,
    public readonly actor: ActorContext,
    /**
     * Drop the branch predicate from the voucher lookup.
     *
     * Only the transfer-order route sets it, and only after
     * `assertParticipantBranch` has already authorized the actor's branch as
     * one end of the transfer. The issue itself belongs to the *other* branch —
     * the source — so a branch-scoped lookup would 404 for the destination
     * branch reading the Điều chuyển từ cửa hàng khác screen, which is exactly
     * the reason the header route next to it is org-scoped too
     * (`TransferOrderService.getExportGoodsIssue`).
     */
    public readonly skipBranchScope = false,
  ) {}
}
