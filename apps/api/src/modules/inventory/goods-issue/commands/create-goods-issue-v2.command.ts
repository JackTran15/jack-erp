import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CreateGoodsIssueV2Dto } from '../dto/create-goods-issue-v2.dto';

export class CreateGoodsIssueV2Command {
  constructor(
    public readonly dto: CreateGoodsIssueV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
