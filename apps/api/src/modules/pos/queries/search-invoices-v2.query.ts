import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceSearchV2Dto } from '../dto/invoice-search-v2.dto';

export class SearchInvoicesV2Query {
  constructor(
    public readonly dto: InvoiceSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
