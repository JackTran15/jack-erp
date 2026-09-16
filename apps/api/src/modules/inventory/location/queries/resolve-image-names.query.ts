import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ResolveImageNamesDto } from '../dto/resolve-image-names.dto';

export class ResolveImageNamesQuery {
  constructor(
    public readonly dto: ResolveImageNamesDto,
    public readonly actor: ActorContext,
  ) {}
}
