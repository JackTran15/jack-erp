import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PromotionSearchV2Dto } from '../dto/promotion-search-v2.dto';

export class SearchPromotionsV2Query {
  constructor(
    public readonly dto: PromotionSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
