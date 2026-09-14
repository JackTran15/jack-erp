import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export class GetPartnerProductQuery {
  constructor(
    public readonly productCode: string,
    public readonly actor: ActorContext,
  ) {}
}
