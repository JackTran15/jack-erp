import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ChangePromotionStatusV2Dto } from '../dto/change-promotion-status.dto';

export class ChangePromotionStatusCommand {
  constructor(
    public readonly id: string,
    public readonly dto: ChangePromotionStatusV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
