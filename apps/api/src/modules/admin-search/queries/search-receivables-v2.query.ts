import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ReceivableSearchV2Dto } from '../dto/receivable-search-v2.dto';

export class SearchReceivablesV2Query {
  constructor(
    public readonly dto: ReceivableSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
