import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class PostGoodsIssueV2Command {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
