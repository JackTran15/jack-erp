import { StockSummaryService } from "./stock-summary.service";
import { StockSummaryGroupBy } from "./dto/stock-summary-query.dto";
import {
  CompareOperator,
  StringOperator,
} from "../../../common/filters/filter.dto";

function createQueryBuilder(rows: unknown[] = []) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    andHaving: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getQueryAndParameters: jest.fn().mockReturnValue(["SELECT 1", []]),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
}

describe("StockSummaryService", () => {
  it("applies CQRS column filters before pagination", async () => {
    const qb = createQueryBuilder([]);
    const manager = {
      query: jest.fn().mockResolvedValue([{ total: 0, total_quantity: "0" }]),
    };
    const service = new StockSummaryService({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager,
    } as never);

    await service.getSummary({
      organizationId: "44444444-4444-4444-8444-444444444444",
      itemCode: { operator: StringOperator.CONTAINS, value: "SKU" },
      quantity: { operator: CompareOperator.LTE, value: 10 },
      page: 2,
      pageSize: 25,
    });

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("item.code ILIKE"),
      expect.any(Object),
    );
    const itemCodeCall = qb.andWhere.mock.calls.find(([sql]) =>
      String(sql).includes("item.code ILIKE"),
    );
    expect(Object.values(itemCodeCall?.[1] ?? {})).toContain("%SKU%");
    expect(qb.andHaving).toHaveBeenCalledWith(
      "SUM(sb.quantity) <= :quantityFilter",
      { quantityFilter: 10 },
    );
    expect(qb.limit).toHaveBeenCalledWith(25);
    expect(qb.offset).toHaveBeenCalledWith(25);
  });

  it("calculates period values from startDate/endDate while preserving movement filters", async () => {
    const row = {
      group_key: "11111111-1111-4111-8111-111111111111",
      product_id: null,
      item_ids: ["11111111-1111-4111-8111-111111111111"],
      item_code: "SKU-1",
      item_name: "Hàng hóa 1",
      item_unit: "Cái",
      item_brand: null,
      item_is_active: true,
      category_name: null,
      storage_id: "22222222-2222-4222-8222-222222222222",
      storage_name: "Kho 1",
      branch_id: "33333333-3333-4333-8333-333333333333",
      quantity: "9",
      last_movement_at: null,
    };
    const qb = createQueryBuilder([row]);
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total: 1, total_quantity: "9" }])
        .mockResolvedValueOnce([
          {
            item_id: row.group_key,
            storage_id: row.storage_id,
            opening_qty: "5",
            opening_value: "50",
            in_qty: "6",
            in_value: "60",
            out_qty: "2",
            out_value: "20",
          },
        ])
        .mockResolvedValueOnce([
          {
            item_id: row.group_key,
            storage_id: row.storage_id,
            transfer_out_qty: "3",
            incoming_qty: "4",
          },
        ])
        .mockResolvedValueOnce([
          {
            item_id: row.group_key,
            storage_id: row.storage_id,
            reserved_qty: "2",
          },
        ]),
    };
    const service = new StockSummaryService({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager,
    } as never);

    const result = await service.getSummary({
      organizationId: "44444444-4444-4444-8444-444444444444",
      branchId: "33333333-3333-4333-8333-333333333333",
      movementFrom: "2026-05-01",
      movementTo: "2026-05-31",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });

    expect(qb.andWhere).toHaveBeenCalledWith("sb.branch_id = :branchId", {
      branchId: "33333333-3333-4333-8333-333333333333",
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      "sb.last_movement_at >= :movementFrom",
      { movementFrom: "2026-05-01" },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      "sb.last_movement_at < :movementToPlus1",
      { movementToPlus1: "2026-06-01" },
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("sle.posted_at < $1"),
      expect.arrayContaining([
        "2026-06-01",
        "2026-07-01",
        "44444444-4444-4444-8444-444444444444",
      ]),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        openingQty: 5,
        inQty: 6,
        outQty: 2,
        closingQty: 9,
        closingValue: 90,
        transferOutQty: 3,
        incomingQty: 4,
        reservedQty: 2,
      }),
    );
  });

  it("counts draft and pending sale OUT lines as branch-scoped customer reservations", async () => {
    const row = {
      group_key: "11111111-1111-4111-8111-111111111111",
      product_id: null,
      item_ids: ["11111111-1111-4111-8111-111111111111"],
      item_code: "SKU-1",
      item_name: "Hàng hóa 1",
      item_unit: "Cái",
      item_brand: null,
      item_is_active: true,
      category_name: null,
      storage_id: "22222222-2222-4222-8222-222222222222",
      storage_name: "Kho 1",
      branch_id: "33333333-3333-4333-8333-333333333333",
      quantity: "9",
      last_movement_at: null,
    };
    const qb = createQueryBuilder([row]);
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total: 1, total_quantity: "9" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            item_id: row.group_key,
            storage_id: row.storage_id,
            reserved_qty: "3",
          },
        ]),
    };
    const service = new StockSummaryService({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager,
    } as never);

    const result = await service.getSummary({
      organizationId: "44444444-4444-4444-8444-444444444444",
      branchId: row.branch_id,
      excludeReservations: true,
    });

    expect(manager.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("invoice.status IN ('draft', 'pending')"),
      expect.arrayContaining([
        row.branch_id,
        "44444444-4444-4444-8444-444444444444",
      ]),
    );
    expect(result.data[0].reservedQty).toBe(3);
  });

  it("returns an incoming-only row when the destination branch has no balance for the SKU", async () => {
    const qb = createQueryBuilder([]);
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total: 0, total_quantity: "0" }])
        .mockResolvedValueOnce([
          {
            group_key: "item-1",
            product_id: null,
            item_code: "SKU-1",
            item_name: "Hàng hóa 1",
            item_unit: "Cái",
            item_brand: null,
            item_is_active: true,
            category_name: null,
            storage_id: null,
            storage_name: null,
            branch_id: "branch-B",
            incoming_qty: "4",
          },
        ]),
    };
    const service = new StockSummaryService({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager,
    } as never);

    const result = await service.getSummary({
      organizationId: "org-1",
      branchId: "branch-B",
      page: 1,
      pageSize: 50,
    });

    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        itemId: "item-1",
        storageId: "pending:branch-B",
        incomingQty: 4,
        quantity: 0,
        storage: expect.objectContaining({ name: "Chưa chọn kho nhận" }),
      }),
    );
  });

  describe("groupBy: SKU", () => {
    it("groups on the parent product and sums every variant's period figures", async () => {
      const row = {
        group_key: "product-1",
        product_id: "product-1",
        item_ids: ["item-A", "item-B"],
        item_code: "ABA2813",
        item_name: "Giày ABA2813",
        item_unit: "Đôi",
        item_brand: null,
        item_is_active: true,
        category_name: null,
        storage_id: "storage-1",
        storage_name: "Kho 1",
        branch_id: "branch-1",
        quantity: "31",
        last_movement_at: null,
      };
      const qb = createQueryBuilder([row]);
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ total: 1, total_quantity: "31" }])
          // One row per variant — the grid row is their sum.
          .mockResolvedValueOnce([
            {
              item_id: "item-A",
              storage_id: "storage-1",
              opening_qty: "2",
              opening_value: "0",
              in_qty: "3",
              in_value: "0",
              out_qty: "1",
              out_value: "0",
            },
            {
              item_id: "item-B",
              storage_id: "storage-1",
              opening_qty: "5",
              opening_value: "0",
              in_qty: "4",
              in_value: "0",
              out_qty: "2",
              out_value: "0",
            },
          ])
          .mockResolvedValue([]),
      };
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      const result = await service.getSummary({
        organizationId: "org-1",
        branchId: "branch-1",
        groupBy: StockSummaryGroupBy.SKU,
        startDate: "2026-05-01",
        endDate: "2026-05-31",
      });

      expect(qb.groupBy).toHaveBeenCalledWith(
        "COALESCE(item.product_id::text, item.id::text)",
      );
      // The period pass still pairs on (item, storage), so both variants have
      // to be in the array — a group key alone would match nothing.
      expect(manager.query.mock.calls[1][1]).toEqual(
        expect.arrayContaining([["item-A", "item-B"]]),
      );
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          groupKey: "product-1",
          productId: "product-1",
          openingQty: 7,
          inQty: 7,
          outQty: 3,
          closingQty: 11,
        }),
      );
    });

    it("scopes the pending-only guard to the whole model, so the footer cannot double count", async () => {
      const qb = createQueryBuilder([]);
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ total: 0, total_quantity: "0" }])
          .mockResolvedValue([]),
      };
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      await service.getSummary({
        organizationId: "org-1",
        branchId: "branch-B",
        groupBy: StockSummaryGroupBy.SKU,
      });

      const pendingOnlySql = manager.query.mock.calls[1][0] as string;
      expect(pendingOnlySql).toContain("FROM items sibling");
      expect(pendingOnlySql).toContain("sibling.product_id = item.product_id");
      expect(pendingOnlySql).not.toContain(
        "pending_balance.item_id = transfer_line.item_id",
      );
    });
  });

  describe("whole-set column totals (grid footer)", () => {
    const TOTALS_ROW = {
      total: 1540,
      total_quantity: "2155",
      opening_qty: "0",
      in_qty: "2196",
      out_qty: "41",
      transfer_out_qty: "7",
      incoming_qty: "4",
      pending_only_incoming_qty: "5",
      reserved_qty: "2",
    };

    function serviceWith(totalsRow: Record<string, unknown>) {
      const qb = createQueryBuilder([]);
      const manager = { query: jest.fn().mockResolvedValue([totalsRow]) };
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);
      return { service, manager, qb };
    }

    it("sums every column over the whole filtered set, not the page", async () => {
      const { service } = serviceWith(TOTALS_ROW);

      const result = await service.getSummary({
        organizationId: "44444444-4444-4444-8444-444444444444",
        branchId: "33333333-3333-4333-8333-333333333333",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        page: 1,
        pageSize: 2,
      });

      expect(result.totals).toEqual({
        quantity: 2155,
        openingQty: 0,
        inQty: 2196,
        outQty: 41,
        // hasPeriod ⇒ derived, exactly as each row derives it.
        closingQty: 2155,
        transferOutQty: 7,
        // Pairs that hold stock plus pairs that only have goods on the way.
        incomingQty: 9,
        reservedQty: 2,
      });
      expect(result.totalQuantity).toBe(2155);
    });

    it("is invariant to pageSize — the footer must not move when the user pages", async () => {
      const small = await serviceWith(TOTALS_ROW).service.getSummary({
        organizationId: "org-1",
        branchId: "branch-1",
        pageSize: 1,
      });
      const large = await serviceWith(TOTALS_ROW).service.getSummary({
        organizationId: "org-1",
        branchId: "branch-1",
        pageSize: 200,
        page: 5,
      });

      expect(small.totals).toEqual(large.totals);
    });

    it("counts incoming-only pairs on every page, not just page 1", async () => {
      const { service } = serviceWith(TOTALS_ROW);

      const pageTwo = await service.getSummary({
        organizationId: "org-1",
        branchId: "branch-1",
        page: 2,
        pageSize: 50,
      });

      // The page path appends incoming-only rows on page 1 only; if the totals
      // inherited that, the footer would shrink the moment the user paged.
      expect(pageTwo.totals?.incomingQty).toBe(9);
    });

    it("falls back to live quantity for closingQty when no period is set", async () => {
      const { service } = serviceWith({ ...TOTALS_ROW, in_qty: "0", out_qty: "0" });

      const result = await service.getSummary({
        organizationId: "org-1",
        branchId: "branch-1",
      });

      expect(result.totals?.closingQty).toBe(2155);
    });

    it("skips the totals statement entirely when includeTotals is false", async () => {
      const { service, manager } = serviceWith({ total: 3, total_quantity: "9" });

      const result = await service.getSummary({
        organizationId: "org-1",
        branchId: "branch-1",
        includeTotals: false,
      });

      expect(result.totals).toBeUndefined();
      expect(result.totalQuantity).toBe(9);
      // The cheap count-only aggregate, not the CTE chain.
      expect(manager.query.mock.calls[0][0]).not.toContain("WITH groups AS");
    });

    it("reduces the totals in memory when a derived-column filter is active", async () => {
      const rows = [1, 2].map((n) => ({
        group_key: `item-${n}`,
        product_id: null,
        item_ids: [`item-${n}`],
        item_code: `SKU-${n}`,
        item_name: `Hàng hóa ${n}`,
        item_unit: "Cái",
        item_brand: null,
        item_is_active: true,
        category_name: null,
        storage_id: "22222222-2222-4222-8222-222222222222",
        storage_name: "Kho 1",
        branch_id: "33333333-3333-4333-8333-333333333333",
        quantity: String(n * 10),
        last_movement_at: null,
      }));
      const qb = createQueryBuilder(rows);
      const manager = {
        query: jest
          .fn()
          // 1st call is the count aggregate; the period query comes after it.
          .mockResolvedValueOnce([{ total: 2, total_quantity: "30" }])
          // period values per (item, storage) — only item-2 passes the filter
          .mockResolvedValueOnce([
            {
              item_id: "item-1",
              storage_id: rows[0].storage_id,
              opening_qty: "1",
              opening_value: "0",
              in_qty: "1",
              in_value: "0",
              out_qty: "0",
              out_value: "0",
            },
            {
              item_id: "item-2",
              storage_id: rows[1].storage_id,
              opening_qty: "4",
              opening_value: "0",
              in_qty: "9",
              in_value: "0",
              out_qty: "3",
              out_value: "0",
            },
          ])
          .mockResolvedValue([]),
      };
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      const result = await service.getSummary({
        organizationId: "org-1",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        inQty: { operator: CompareOperator.GTE, value: 5 },
      });

      // Only item-2 survives the derived filter, so the footer must describe
      // item-2 alone — the totals of the unfiltered set would be wrong.
      expect(result.total).toBe(1);
      expect(result.totals).toEqual(
        expect.objectContaining({ quantity: 20, inQty: 9, outQty: 3, openingQty: 4 }),
      );
      // No totals statement is worth running when every row is already loaded.
      const sqlSeen = manager.query.mock.calls.map(([sql]) => String(sql));
      expect(sqlSeen.some((sql) => sql.includes("WITH groups AS"))).toBe(false);
    });
  });
});
