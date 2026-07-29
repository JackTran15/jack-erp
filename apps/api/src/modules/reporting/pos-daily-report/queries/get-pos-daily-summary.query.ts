import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PosDailySummaryDto } from '../dto/pos-daily-summary.dto';

/** Query: aggregate the POS daily summary for one time window (org + branch scoped). */
export class GetPosDailySummaryQuery {
  constructor(
    public readonly dto: PosDailySummaryDto,
    public readonly actor: ActorContext,
  ) {}
}
