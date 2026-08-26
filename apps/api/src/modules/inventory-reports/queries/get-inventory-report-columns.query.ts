import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryReportColumnsFilterDto } from '../report/inventory-report-definition';

export class GetInventoryReportColumnsQuery {
  constructor(
    public readonly reportType: string,
    public readonly actor: ActorContext,
    /** Shapes the catalog for reports whose columns depend on the request. */
    public readonly filters?: InventoryReportColumnsFilterDto,
  ) {}
}
