import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

export class GetInvoiceDetailQuery {
  constructor(
    public readonly code: string,
    public readonly actor: ActorContext,
    /** Preferred over `code`: unique on its own, while a code is not. */
    public readonly id?: string,
  ) {}
}
