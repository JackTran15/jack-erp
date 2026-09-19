import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';

export class SearchCashFundReportQuery {
  constructor(
    public readonly dto: CashFundReportSearchDto,
    public readonly actor: ActorContext,
  ) {}
}
