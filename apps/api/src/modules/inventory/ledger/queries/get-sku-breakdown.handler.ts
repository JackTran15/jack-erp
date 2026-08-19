import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { StockSummaryDetailService } from "../stock-summary-detail.service";
import { GetSkuBreakdownQuery } from "./get-sku-breakdown.query";

@QueryHandler(GetSkuBreakdownQuery)
export class GetSkuBreakdownHandler
  implements IQueryHandler<GetSkuBreakdownQuery>
{
  constructor(private readonly service: StockSummaryDetailService) {}

  execute({ dto, actor }: GetSkuBreakdownQuery) {
    return this.service.getSkuBreakdown(
      dto,
      actor.organizationId,
      actor.branchId,
    );
  }
}
