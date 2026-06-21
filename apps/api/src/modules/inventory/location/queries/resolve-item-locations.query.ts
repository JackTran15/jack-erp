import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ResolveItemLocationsDto } from '../dto/resolve-item-locations.dto';

export class ResolveItemLocationsQuery {
  constructor(
    public readonly dto: ResolveItemLocationsDto,
    public readonly actor: ActorContext,
  ) {}
}
