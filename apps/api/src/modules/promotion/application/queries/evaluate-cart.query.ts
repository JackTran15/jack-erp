import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { EvaluateCartDto } from '../dto/evaluate-cart.dto';

export class EvaluateCartQuery {
  constructor(
    public readonly dto: EvaluateCartDto,
    public readonly actor: ActorContext,
  ) {}
}
