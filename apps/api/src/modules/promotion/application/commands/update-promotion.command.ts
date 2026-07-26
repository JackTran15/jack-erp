import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { UpdatePromotionV2Dto } from '../dto/update-promotion.dto';

export class UpdatePromotionCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdatePromotionV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
