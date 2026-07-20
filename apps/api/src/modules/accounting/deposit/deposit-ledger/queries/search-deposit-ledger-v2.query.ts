import { ActorContext } from '../../../../../common/decorators/actor-context.decorator';
import { DepositLedgerSearchV2Dto } from '../dto/deposit-ledger-search-v2.dto';

export class SearchDepositLedgerV2Query {
  constructor(
    public readonly dto: DepositLedgerSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
