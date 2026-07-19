import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DebtReportSearchDto } from '../dto/debt-report-search.dto';

export class SearchDebtReportQuery {
  constructor(
    public readonly dto: DebtReportSearchDto,
    public readonly actor: ActorContext,
  ) {}
}
