import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../dto/inventory-report-search.dto';

export class SearchInventoryReportQuery {
  constructor(
    public readonly dto: InventoryReportSearchDto,
    public readonly actor: ActorContext,
  ) {}
}
