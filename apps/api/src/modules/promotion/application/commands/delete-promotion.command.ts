import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class DeletePromotionCommand {
  constructor(
    public readonly id: string,
    public readonly actor: ActorContext,
  ) {}
}
