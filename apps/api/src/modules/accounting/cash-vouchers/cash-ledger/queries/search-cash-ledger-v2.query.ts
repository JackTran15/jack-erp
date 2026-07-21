import { ActorContext } from '../../../../../common/decorators/actor-context.decorator';
import { CashLedgerSearchV2Dto } from '../dto/cash-ledger-search-v2.dto';

export class SearchCashLedgerV2Query {
  constructor(
    public readonly dto: CashLedgerSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
