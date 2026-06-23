import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ExpenseSearchV2Dto } from '../dto/expense-search-v2.dto';

export class SearchExpensesV2Query {
  constructor(
    public readonly dto: ExpenseSearchV2Dto,
    public readonly actor: ActorContext,
  ) {}
}
