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

  it("filters the category subtree, not just the selected category", async () => {
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
      categoryId: "55555555-5555-4555-8555-555555555555",
    });

    const categoryCall = qb.andWhere.mock.calls.find(([sql]) =>
      String(sql).includes("item.category_id IN"),
    );
    expect(categoryCall).toBeDefined();
    // Items hang off leaf categories, so a parent group only matches through
    // its descendants — an `item.category_id = :categoryId` equality is the bug
    // this guards against.
    expect(String(categoryCall?.[0])).toContain("WITH RECURSIVE");
    expect(String(categoryCall?.[0])).toContain("child.parent_group_id");
    expect(categoryCall?.[1]).toEqual({
      categoryId: "55555555-5555-4555-8555-555555555555",
    });
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

  describe("pending-only rows bypass the filter (T-01-01, reproduces the reported leak/dup)", () => {
    // Fixture shape, per the ticket's precondition note:
    //  - DNGUAB064 has a real balance at storage-A (comes back from the page
    //    query, which — unlike the pending-only query — genuinely applies
    //    `search`).
    //  - DNGUAB064 also has an IN_PROGRESS transfer order into storage-B (a
    //    *different*, real destination storage): shape (1), legitimate under
    //    the (SKU × storage) grain and must survive T-01-02.
    //  - DNGUAB064 also has a second IN_PROGRESS transfer order with
    //    `destination_storage_id IS NULL`: shape (2), a true duplicate of the
    //    storage-A row that T-01-02 must collapse away.
    //  - TXV6079 is an unrelated SKU with its own IN_PROGRESS transfer, used
    //    to prove the pending-only query ignores `search` entirely.
    const branchId = "branch-1";
    const dnguabKey = "item-dnguab064";

    function buildQb() {
      return createQueryBuilder([
        {
          group_key: dnguabKey,
          product_id: null,
          item_ids: [dnguabKey],
          item_code: "DNGUAB064",
          item_name: "Đế giày ABA064",
          item_unit: "Đôi",
          item_brand: null,
          item_is_active: true,
          category_name: null,
          storage_id: "storage-A",
          storage_name: "Kho A",
          branch_id: branchId,
          quantity: "12",
          last_movement_at: null,
        },
      ]);
    }

    function buildManager() {
      return {
        query: jest
          .fn()
          // 1) totals aggregate
          .mockResolvedValueOnce([{ total: 1, total_quantity: "12" }])
          // 2) pendingTransferQuery (transfer-out / incoming for the page's
          //    own (item, storage) pairs) — irrelevant here
          .mockResolvedValueOnce([])
          // 3) reservationQuery — irrelevant here
          .mockResolvedValueOnce([])
          // 4) pendingOnlyQuery — the query with only 4 WHERE clauses and no
          //    `search`, per the ticket's verified context.
          .mockResolvedValueOnce([
            {
              group_key: dnguabKey,
              product_id: null,
              item_code: "DNGUAB064",
              item_name: "Đế giày ABA064",
              item_unit: "Đôi",
              item_brand: null,
              item_is_active: true,
              category_name: null,
              storage_id: "storage-B",
              storage_name: "Kho B",
              branch_id: branchId,
              incoming_qty: "5",
            },
            {
              group_key: dnguabKey,
              product_id: null,
              item_code: "DNGUAB064",
              item_name: "Đế giày ABA064",
              item_unit: "Đôi",
              item_brand: null,
              item_is_active: true,
              category_name: null,
              storage_id: null,
              storage_name: null,
              branch_id: branchId,
              incoming_qty: "3",
            },
            {
              group_key: "item-txv6079",
              product_id: null,
              item_code: "TXV6079",
              item_name: "Hàng hóa TXV6079",
              item_unit: "Cái",
              item_brand: null,
              item_is_active: true,
              category_name: null,
              storage_id: "storage-C",
              storage_name: "Kho C",
              branch_id: branchId,
              incoming_qty: "8",
            },
          ]),
      };
    }

    it("pendingOnlyQuery carries the same `search` predicate as buildBaseQuery, so TXV6079-style rows cannot leak", async () => {
      const qb = buildQb();
      const manager = buildManager();
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      await service.getSummary({
        organizationId: "org-1",
        branchId,
        search: "DNGUAB064",
        storageId: undefined,
        page: 1,
      });

      // Asserting against `result.data` here would only prove that a test
      // double built by hand happens to omit TXV6079 — it says nothing about
      // whether the real query does. This asserts on the actual mechanism
      // instead (T-01-01 originally reproduced the leak by observing that
      // `pendingOnlyQuery`, :402-440 at the time, had no `search` predicate
      // at all): the main query's own `search` clause (`applyCommonFilters`,
      // shared with `pendingOnlyQuery` via `RawSqlWhereCollector`)...
      const baseSearchCall = qb.andWhere.mock.calls.find(([sql]) =>
        String(sql).includes("ILIKE :q"),
      );
      expect(baseSearchCall).toBeDefined();
      expect(String(baseSearchCall?.[0])).toBe(
        "(item.code ILIKE :q OR item.name ILIKE :q)",
      );

      // ...and pendingOnlyQuery (4th manager.query call — see the "binds
      // `search`" test below for the call-order breakdown) carries the same
      // shape, translated to a bound `$n` positional placeholder instead of
      // TypeORM's `:q`. A row whose code/name does not match this WHERE
      // clause can never reach the merge step, regardless of what a mock
      // hands back.
      const [pendingOnlySql] = manager.query.mock.calls[3];
      expect(String(pendingOnlySql)).toMatch(
        /\(item\.code ILIKE \$\d+ OR item\.name ILIKE \$\d+\)/,
      );
    });

    it("RED: DNGUAB064 collapses to one duplicate row instead of two legitimate ones", async () => {
      const qb = buildQb();
      const manager = buildManager();
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      const result = await service.getSummary({
        organizationId: "org-1",
        branchId,
        search: "DNGUAB064",
        storageId: undefined,
        page: 1,
      });

      const dnguabRows = result.data.filter(
        (row) => row.item.code === "DNGUAB064",
      );
      // Actual (buggy) shape observed: 3 rows for DNGUAB064 —
      //   storageId "storage-A"          (real balance)
      //   storageId "storage-B"          (shape 1: real destination storage —
      //                                   legitimate under the SKU × storage
      //                                   grain, must survive T-01-02)
      //   storageId "pending:branch-1"   (shape 2: destination_storage_id IS
      //                                   NULL — a true duplicate of the
      //                                   storage-A row; T-01-02 must remove
      //                                   this one, not the storage-B row)
      // Expected after the fix: exactly the storage-A and storage-B rows.
      expect(dnguabRows.map((row) => row.storageId).sort()).toEqual(
        ["storage-A", "storage-B"].sort(),
      );
    });

    it("AC-05: pending-only rows still show for every SKU when no filter is applied", async () => {
      const qb = buildQb();
      const manager = buildManager();
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      const result = await service.getSummary({
        organizationId: "org-1",
        branchId,
        page: 1,
      });

      // A-03: the pending-only block must never disappear just because no
      // filter narrowed it — only `search`/column filters (and the dedupe
      // guard) should ever drop a row from it.
      const codes = result.data.map((row) => row.item.code);
      expect(codes).toContain("TXV6079");
      const dnguabRows = result.data.filter(
        (row) => row.item.code === "DNGUAB064",
      );
      expect(dnguabRows.map((row) => row.storageId).sort()).toEqual(
        ["storage-A", "storage-B"].sort(),
      );
    });

    it("binds `search` into pendingOnlyQuery as a parameter, never string-interpolated", async () => {
      const qb = buildQb();
      const manager = buildManager();
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      await service.getSummary({
        organizationId: "org-1",
        branchId,
        search: "DNGUAB064",
        storageId: undefined,
        page: 1,
      });

      // pendingOnlyQuery is the 4th manager.query call here: totals, then
      // pendingTransferQuery / reservationQuery (both fire because the page
      // query returned a row), then pendingOnlyQuery.
      const [sql, params] = manager.query.mock.calls[3];
      expect(String(sql)).toContain("item.code ILIKE $");
      expect(String(sql)).not.toContain("DNGUAB064");
      expect(params).toContain("%DNGUAB064%");
    });
  });

  describe("pending-only merge happens before pagination, not after (T-01-03, ADR-01)", () => {
    // These asserts route on the SQL text itself (not call order/count),
    // per the T-01-02 lesson: a mock told to always return the same value
    // regardless of which query fired must not be able to fake a pass here.
    function contentAwareManager(
      overrides: {
        pendingOnly?: unknown[];
        period?: unknown[];
        pendingTransfer?: unknown[];
        reservation?: unknown[];
        aggregate?: Record<string, unknown>;
      } = {},
    ) {
      return {
        query: jest.fn((sql: string) => {
          const s = String(sql);
          if (s.includes("destination_branch_id AS branch_id")) {
            return Promise.resolve(overrides.pendingOnly ?? []);
          }
          if (s.includes("sle.posted_at")) {
            return Promise.resolve(overrides.period ?? []);
          }
          if (s.includes("transfer_out_qty")) {
            return Promise.resolve(overrides.pendingTransfer ?? []);
          }
          if (s.includes("reserved_qty") && s.includes("invoice_item")) {
            return Promise.resolve(overrides.reservation ?? []);
          }
          return Promise.resolve([
            overrides.aggregate ?? { total: 0, total_quantity: "0" },
          ]);
        }),
      };
    }

    const branchId = "branch-1";

    function realRow(code: string, storageId: string) {
      return {
        group_key: `item-${code}`,
        product_id: null,
        item_ids: [`item-${code}`],
        item_code: code,
        item_name: `Hàng ${code}`,
        item_unit: "Cái",
        item_brand: null,
        item_is_active: true,
        category_name: null,
        storage_id: storageId,
        storage_name: `Kho ${storageId}`,
        branch_id: branchId,
        quantity: "1",
        last_movement_at: null,
      };
    }

    function pendingRow(code: string, incomingQty: string) {
      return {
        group_key: `item-${code}`,
        product_id: null,
        item_code: code,
        item_name: `Hàng ${code}`,
        item_unit: "Cái",
        item_brand: null,
        item_is_active: true,
        category_name: null,
        storage_id: null,
        storage_name: null,
        branch_id: branchId,
        incoming_qty: incomingQty,
      };
    }

    it("page 1 never returns more than pageSize rows, even once a pending row is merged in", async () => {
      // A full SQL page (2 of 2) plus one new pending row: naively pushing
      // the pending row on afterwards would leave page 1 with 3 rows.
      const qb = createQueryBuilder([realRow("AAA", "s1"), realRow("BBB", "s2")]);
      const manager = contentAwareManager({
        pendingOnly: [pendingRow("CCC", "5")],
      });
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      const result = await service.getSummary({
        organizationId: "org-1",
        branchId,
        page: 1,
        pageSize: 2,
      });

      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.total).toBe(3);
    });

    it("a pending row appears on its correct page when paging past page 1", async () => {
      // "AAA" (the pending row) sorts before the real "ZZZ" row, so page 1
      // (size 1) is the pending AAA and page 2 is the real ZZZ — asserting
      // page 2 here proves the merge ran before the slice, not after it (the
      // old code only ever appended pending rows onto page 1).
      const qb = createQueryBuilder([realRow("ZZZ", "s1")]);
      const manager = contentAwareManager({
        pendingOnly: [pendingRow("AAA", "7")],
      });
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      const result = await service.getSummary({
        organizationId: "org-1",
        branchId,
        page: 2,
        pageSize: 1,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          itemId: "item-ZZZ",
          quantity: 1,
          incomingQty: 0,
        }),
      );
      expect(result.total).toBe(2);
    });

    it("total equals the number of rows obtainable across every page", async () => {
      const qb = createQueryBuilder([realRow("AAA", "s1"), realRow("BBB", "s2")]);
      const manager = contentAwareManager({
        pendingOnly: [pendingRow("CCC", "5")],
      });
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      const page1 = await service.getSummary({
        organizationId: "org-1",
        branchId,
        page: 1,
        pageSize: 2,
      });
      const page2 = await service.getSummary({
        organizationId: "org-1",
        branchId,
        page: 2,
        pageSize: 2,
      });

      expect(page1.total).toBe(3);
      expect(page2.total).toBe(3);
      const seen = [...page1.data, ...page2.data].map((row) => row.itemId);
      expect(new Set(seen).size).toBe(3);
      expect(seen).toHaveLength(3);
    });

    it("keeps the SQL LIMIT/OFFSET path when there is no incoming stock to merge (the common case)", async () => {
      const qb = createQueryBuilder([realRow("AAA", "s1")]);
      const manager = contentAwareManager({ pendingOnly: [] });
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      await service.getSummary({
        organizationId: "org-1",
        branchId,
        page: 2,
        pageSize: 20,
      });

      // Called exactly once: nothing to merge means no second, unpaginated
      // fetch of the filtered set (ADR-01's performance requirement).
      expect(qb.limit).toHaveBeenCalledTimes(1);
      expect(qb.limit).toHaveBeenCalledWith(20);
      expect(qb.offset).toHaveBeenCalledTimes(1);
      expect(qb.offset).toHaveBeenCalledWith(20);
    });

    it("sorts a merged pending row into its alphabetical position, not just appended at the end", async () => {
      const qb = createQueryBuilder([realRow("ZZZ", "s1")]);
      const manager = contentAwareManager({
        pendingOnly: [pendingRow("AAA", "3")],
      });
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      const result = await service.getSummary({
        organizationId: "org-1",
        branchId,
        page: 1,
        pageSize: 50,
      });

      expect(result.data.map((row) => row.item.code)).toEqual([
        "AAA",
        "ZZZ",
      ]);
    });
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

    it("the totals query's `pending_only` CTE carries the same `search` predicate as pendingOnlyQuery (T-01-04), so the footer's incoming total cannot leak the whole branch", async () => {
      const qb = createQueryBuilder([]);
      const manager = {
        query: jest.fn().mockResolvedValue([{ total: 0, total_quantity: "0" }]),
      };
      const service = new StockSummaryService({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
        manager,
      } as never);

      await service.getSummary({
        organizationId: "org-1",
        branchId: "branch-1",
        search: "DNGUAB064",
      });

      // Same predicate the main query applies (buildBaseQuery, via
      // applyCommonFilters) — proves both come from one source, not a third
      // hand-written copy.
      const baseSearchCall = qb.andWhere.mock.calls.find(([sql]) =>
        String(sql).includes("ILIKE :q"),
      );
      expect(String(baseSearchCall?.[0])).toBe(
        "(item.code ILIKE :q OR item.name ILIKE :q)",
      );

      // aggSql itself is mocked to "SELECT 1" here, so any `ILIKE` match in
      // the totals SQL must come from the `pending_only` CTE's own extra
      // conditions, appended via the same `RawSqlWhereCollector` shim
      // `pendingOnlyQuery` (T-01-02) uses.
      const [totalsSql, totalsParams] = manager.query.mock.calls[0];
      expect(String(totalsSql)).toContain("pending_only AS (");
      expect(String(totalsSql)).toMatch(
        /\(item\.code ILIKE \$\d+ OR item\.name ILIKE \$\d+\)/,
      );
      // Parameterised, never interpolated into the SQL text.
      expect(String(totalsSql)).not.toContain("DNGUAB064");
      expect(totalsParams).toContain("%DNGUAB064%");
    });

    it("footer's incoming total is zero when the filter matches zero rows, not the whole branch's total (T-01-04)", async () => {
      // Simulates what the real `pending_only` CTE returns once its own
      // filter (above) excludes every row: the aggregate row itself carries
      // 0, not the unfiltered branch figure — `readTotals` must pass that
      // through unchanged rather than falling back to some wider total.
      const { service } = serviceWith({
        ...TOTALS_ROW,
        incoming_qty: "0",
        pending_only_incoming_qty: "0",
      });

      const result = await service.getSummary({
        organizationId: "org-1",
        branchId: "branch-1",
        search: "no-such-sku-matches",
      });

      expect(result.totals?.incomingQty).toBe(0);
    });
  });
});
