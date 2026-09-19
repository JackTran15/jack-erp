import { ActorContext } from '../../../../../common/decorators/actor-context.decorator';
import { SearchCashVoucherCategoryTreeDto } from '../dto/search-cash-voucher-category-tree.dto';

export class SearchCashVoucherCategoryTreeQuery {
  constructor(
    public readonly dto: SearchCashVoucherCategoryTreeDto,
    public readonly actor: ActorContext,
  ) {}
}
