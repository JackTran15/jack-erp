import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RoleSearchV2Dto } from '../dto/role-search-v2.dto';

export class SearchRolesV2Query {
  constructor(
    public readonly dto: RoleSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
