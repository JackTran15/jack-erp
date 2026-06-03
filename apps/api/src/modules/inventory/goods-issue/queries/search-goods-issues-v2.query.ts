import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { GoodsIssueSearchV2Dto } from '../dto/goods-issue-search-v2.dto';

export class SearchGoodsIssuesV2Query {
  constructor(
    public readonly dto: GoodsIssueSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
