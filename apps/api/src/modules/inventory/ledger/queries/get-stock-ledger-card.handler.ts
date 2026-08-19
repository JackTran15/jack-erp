import { BadRequestException } from "@nestjs/common";
import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { StockSummaryDetailService } from "../stock-summary-detail.service";
import { GetStockLedgerCardQuery } from "./get-stock-ledger-card.query";

@QueryHandler(GetStockLedgerCardQuery)
export class GetStockLedgerCardHandler
  implements IQueryHandler<GetStockLedgerCardQuery>
{
  constructor(private readonly service: StockSummaryDetailService) {}

  execute({ dto, actor }: GetStockLedgerCardQuery) {
    if (!actor.branchId) {
      // The ledger is branch-scoped; without a branch the card would silently
      // mix warehouses that happen to share a storage id.
      throw new BadRequestException("Thiếu chi nhánh (X-Branch-Id).");
    }
    return this.service.getLedgerCard(dto, actor.organizationId, actor.branchId);
  }
}
