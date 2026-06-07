import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { LocationSearchV2Dto } from '../dto/location-search-v2.dto';

export class SearchLocationsV2Query {
  constructor(
    public readonly dto: LocationSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
