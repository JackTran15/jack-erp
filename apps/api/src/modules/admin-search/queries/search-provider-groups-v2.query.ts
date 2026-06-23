import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ProviderGroupSearchV2Dto } from '../dto/provider-group-search-v2.dto';

export class SearchProviderGroupsV2Query {
  constructor(
    public readonly dto: ProviderGroupSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
