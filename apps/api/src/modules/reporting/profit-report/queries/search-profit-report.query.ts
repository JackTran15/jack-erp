import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ProfitReportSearchDto } from '../dto/profit-report-search.dto';

export class SearchProfitReportQuery {
  constructor(
    public readonly dto: ProfitReportSearchDto,
    public readonly actor: ActorContext,
  ) {}
}
