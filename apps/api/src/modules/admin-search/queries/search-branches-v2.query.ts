import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchSearchV2Dto } from '../dto/branch-search-v2.dto';

export class SearchBranchesV2Query {
  constructor(
    public readonly dto: BranchSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
