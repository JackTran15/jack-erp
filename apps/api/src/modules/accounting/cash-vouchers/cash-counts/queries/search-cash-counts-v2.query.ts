import { ActorContext } from '../../../../../common/decorators/actor-context.decorator';
import { CashCountSearchV2Dto } from '../dto/cash-count-search-v2.dto';

export class SearchCashCountsV2Query {
  constructor(
    public readonly dto: CashCountSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
