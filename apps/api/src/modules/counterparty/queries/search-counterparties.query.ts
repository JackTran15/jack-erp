import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { SearchCounterpartiesDto } from '../dto/search-counterparties.dto';

export class SearchCounterpartiesQuery {
  constructor(
    public readonly dto: SearchCounterpartiesDto,
    public readonly actor: ActorContext,
  ) {}
}
