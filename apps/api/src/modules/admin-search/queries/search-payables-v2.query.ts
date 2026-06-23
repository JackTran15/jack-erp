import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PayableSearchV2Dto } from '../dto/payable-search-v2.dto';

export class SearchPayablesV2Query {
  constructor(
    public readonly dto: PayableSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
