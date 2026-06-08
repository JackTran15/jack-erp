import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { JobPositionSearchV2Dto } from '../dto/job-position-search-v2.dto';

export class SearchJobPositionsV2Query {
  constructor(
    public readonly dto: JobPositionSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
