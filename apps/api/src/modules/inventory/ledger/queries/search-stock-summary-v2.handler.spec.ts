import {
  CompareOperator,
  StringOperator,
} from "../../../../common/filters/filter.dto";
import { SearchStockSummaryV2Handler } from "./search-stock-summary-v2.handler";
import { SearchStockSummaryV2Query } from "./search-stock-summary-v2.query";

describe("SearchStockSummaryV2Handler", () => {
  it("scopes the CQRS search to the actor and maps limit to pageSize", async () => {
    const service = {
      getSummary: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 2,
        pageSize: 25,
        totalQuantity: 0,
      }),
    };
    const handler = new SearchStockSummaryV2Handler(service as never);
    const dto = {
      page: 2,
      limit: 25,
      excludeReservations: true,
      itemCode: { operator: StringOperator.CONTAINS, value: "SKU" },
      quantity: { operator: CompareOperator.LTE, value: 10 },
    };
    const actor = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      branchId: "22222222-2222-4222-8222-222222222222",
    };

    await handler.execute(new SearchStockSummaryV2Query(dto, actor as never));

    expect(service.getSummary).toHaveBeenCalledWith({
      ...dto,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      page: 2,
      pageSize: 25,
    });
  });
});
