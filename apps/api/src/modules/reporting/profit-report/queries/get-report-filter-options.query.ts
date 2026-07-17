import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ReportFilterOptionsQueryDto } from '../dto/report-filter-options-query.dto';

/** Loads dropdown options for a profit report filter, dispatched by dto.type. */
export class GetReportFilterOptionsQuery {
  constructor(
    public readonly dto: ReportFilterOptionsQueryDto,
    public readonly actor: ActorContext,
  ) {}
}
