import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { GoodsIssueEntity } from '../goods-issue.entity';
import { GoodsIssueService } from '../goods-issue.service';
import { PostGoodsIssueV2Command } from './post-goods-issue-v2.command';

/**
 * Posts a v2 DRAFT issue (DRAFT → POSTED). The transition writes the stock ledger
 * (GOODS_ISSUE, negative) and resolves the instant average cost — audited logic
 * deliberately reused via the proven domain service rather than reimplemented.
 */
@CommandHandler(PostGoodsIssueV2Command)
export class PostGoodsIssueV2Handler
  implements ICommandHandler<PostGoodsIssueV2Command>
{
  constructor(private readonly goodsIssueService: GoodsIssueService) {}

  execute({ id, actor }: PostGoodsIssueV2Command): Promise<GoodsIssueEntity> {
    return this.goodsIssueService.post(id, actor);
  }
}
