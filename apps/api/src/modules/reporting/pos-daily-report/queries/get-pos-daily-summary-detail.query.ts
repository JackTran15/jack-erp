import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PosDailySummaryDetailDto } from '../dto/pos-daily-summary-detail.dto';

export class GetPosDailySummaryDetailQuery {
  constructor(
    public readonly dto: PosDailySummaryDetailDto,
    public readonly actor: ActorContext,
  ) {}
}
