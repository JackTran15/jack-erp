import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { SearchBranchSalesOrdersDto } from '../dto/search-branch-sales-orders.dto';

export class SearchBranchSalesOrdersQuery {
  constructor(
    public readonly dto: SearchBranchSalesOrdersDto,
    public readonly actor: ActorContext,
  ) {}
}
