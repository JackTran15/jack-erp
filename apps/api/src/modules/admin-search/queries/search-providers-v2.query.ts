import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ProviderSearchV2Dto } from '../dto/provider-search-v2.dto';

export class SearchProvidersV2Query {
  constructor(
    public readonly dto: ProviderSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
