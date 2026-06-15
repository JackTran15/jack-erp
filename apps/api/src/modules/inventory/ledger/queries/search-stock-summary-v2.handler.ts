import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { StockSummaryService } from "../stock-summary.service";
import { SearchStockSummaryV2Query } from "./search-stock-summary-v2.query";

@QueryHandler(SearchStockSummaryV2Query)
export class SearchStockSummaryV2Handler implements IQueryHandler<SearchStockSummaryV2Query> {
  constructor(private readonly service: StockSummaryService) {}

  execute({ dto, actor }: SearchStockSummaryV2Query) {
    return this.service.getSummary({
      ...dto,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      page: dto.page,
      pageSize: dto.limit,
    });
  }
}
