import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashVoucherSearchV2Dto } from '../dto/cash-voucher-search-v2.dto';

export class SearchCashVouchersV2Query {
  constructor(
    public readonly dto: CashVoucherSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
