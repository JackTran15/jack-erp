import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { VoucherSearchV2Dto } from '../dto/voucher-search-v2.dto';

export class SearchVouchersV2Query {
  constructor(
    public readonly dto: VoucherSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
