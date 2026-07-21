import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DepositVoucherSearchV2Dto } from '../dto/deposit-voucher-search-v2.dto';

export class SearchDepositVouchersV2Query {
  constructor(
    public readonly dto: DepositVoucherSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
