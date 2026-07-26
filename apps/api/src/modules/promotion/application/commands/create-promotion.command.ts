import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CreatePromotionV2Dto } from '../dto/create-promotion.dto';

export class CreatePromotionCommand {
  constructor(
    public readonly dto: CreatePromotionV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
