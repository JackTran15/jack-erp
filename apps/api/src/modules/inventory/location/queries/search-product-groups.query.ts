import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { SearchProductGroupsDto } from '../dto/search-product-groups.dto';

export class SearchProductGroupsQuery {
  constructor(
    public readonly dto: SearchProductGroupsDto,
    public readonly actor: ActorContext,
  ) {}
}
