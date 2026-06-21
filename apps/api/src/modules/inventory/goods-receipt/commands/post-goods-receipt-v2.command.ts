import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class PostGoodsReceiptV2Command {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
