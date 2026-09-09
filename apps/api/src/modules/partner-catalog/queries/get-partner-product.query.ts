import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export class GetPartnerProductQuery {
  constructor(
    public readonly productId: string,
    public readonly actor: ActorContext,
  ) {}
}
