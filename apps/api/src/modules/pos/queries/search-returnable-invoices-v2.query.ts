import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ReturnableInvoiceSearchV2Dto } from '../dto/returnable-invoice-search-v2.dto';

export class SearchReturnableInvoicesV2Query {
  constructor(
    public readonly dto: ReturnableInvoiceSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
