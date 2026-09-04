import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { GoodsIssueLineSearchV2Dto } from '../dto/goods-issue-line-search-v2.dto';

export class SearchGoodsIssueLinesV2Query {
  constructor(
    public readonly goodsIssueId: string,
    public readonly dto: GoodsIssueLineSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
