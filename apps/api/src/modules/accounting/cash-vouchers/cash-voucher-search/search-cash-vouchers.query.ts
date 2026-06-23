import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashVoucherSearchDto } from './cash-voucher-search.dto';

export class SearchCashVouchersQuery {
  constructor(
    public readonly dto: CashVoucherSearchDto,
    public readonly actor: ActorContext,
  ) {}
}
