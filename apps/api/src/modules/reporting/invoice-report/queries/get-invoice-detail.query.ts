import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class GetInvoiceDetailQuery {
  constructor(
    public readonly code: string,
    public readonly actor: ActorContext,
  ) {}
}
