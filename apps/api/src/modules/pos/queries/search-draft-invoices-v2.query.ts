import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DraftInvoiceSearchV2Dto } from '../dto/draft-invoice-search-v2.dto';

export class SearchDraftInvoicesV2Query {
  constructor(
    public readonly dto: DraftInvoiceSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
