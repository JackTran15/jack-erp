import { StockSummaryDetailService } from "./stock-summary-detail.service";
import { descriptionSql } from "./stock-ledger-reference.constants";
import { StringOperator } from "../../../common/filters/filter.dto";
import { StockLedgerCardDto } from "./dto/stock-ledger-card.dto";

/**
 * `getLedgerCard` runs 5 raw `dataSource.query()` calls inside one
 * `Promise.all` (page rows, stats, opening/closing balances,
 * `loadPendingTransfers`'s own query, item unit) — all invoked synchronously
 * in that order before any of them resolve, so `mockResolvedValueOnce` calls
 * queued in this order line up correctly regardless of resolution timing.
 */
function mockLedgerCardQueries(
  query: jest.Mock,
  pageRows: unknown[],
  opts?: { totalRows?: number },
) {
  query
    .mockResolvedValueOnce(pageRows) // pageSql
    .mockResolvedValueOnce([
      { total_rows: opts?.totalRows ?? pageRows.length, total_in: "0", total_out: "0" },
    ]) // statsSql
    .mockResolvedValueOnce([{ opening_qty: "0", closing_qty: "0" }]) // opening/closing
    .mockResolvedValueOnce([]) // loadPendingTransfers's own internal query (branchId is always set in these tests, so it does query)
    .mockResolvedValueOnce([{ unit: "Đôi" }]); // item unit
}

function baseDto(overrides: Partial<StockLedgerCardDto> = {}): StockLedgerCardDto {
  return {
    itemId: "11111111-1111-1111-1111-111111111111",
    storageId: "22222222-2222-2222-2222-222222222222",
    ...overrides,
  } as StockLedgerCardDto;
}

describe("StockSummaryDetailService.getLedgerCard", () => {
  it("reads the resolved description, not the raw ledger notes (AC-01/AC-02)", async () => {
    const query = jest.fn();
    mockLedgerCardQueries(query, [
      {
        id: "row-1",
        reference_type: "GOODS_RECEIPT",
        posted_at: new Date("2026-08-22T00:11:00Z"),
        in_qty: "10",
        out_qty: "0",
        balance_qty: "10",
        document_number: "NK000240",
        description: "Nhập kho Biên Hòa 2",
      },
    ]);
    const service = new StockSummaryDetailService({ query } as never);

    const result = await service.getLedgerCard(
      baseDto(),
      "org-1",
      "branch-1",
    );

    expect(result.data[0].description).toBe("Nhập kho Biên Hòa 2");
  });

  it("returns null description for a reference type with no source column (AC-03)", async () => {
    const query = jest.fn();
    mockLedgerCardQueries(query, [
      {
        id: "row-2",
        reference_type: "INVOICE",
        posted_at: new Date("2026-08-31T00:00:00Z"),
        in_qty: "0",
        out_qty: "1",
        balance_qty: "9",
        document_number: "HD00123",
        description: null,
      },
    ]);
    const service = new StockSummaryDetailService({ query } as never);

    const result = await service.getLedgerCard(
      baseDto(),
      "org-1",
      "branch-1",
    );

    expect(result.data[0].description).toBeNull();
  });

  it("filters on the resolved description, not the raw ledger notes (AC-04)", async () => {
    const query = jest.fn();
    mockLedgerCardQueries(query, []);
    const service = new StockSummaryDetailService({ query } as never);

    await service.getLedgerCard(
      baseDto({
        description: { operator: StringOperator.CONTAINS, value: "Biên Hòa" },
      }),
      "org-1",
      "branch-1",
    );

    const [pageSql] = query.mock.calls[0];
    expect(pageSql).toContain("resolved_description");
    expect(pageSql).not.toContain("COALESCE(m.notes");
  });
});

describe("descriptionSql", () => {
  it("resolves GOODS_RECEIPT from goods_receipts.description", () => {
    const sql = descriptionSql("sle");
    expect(sql).toContain(
      "WHEN 'GOODS_RECEIPT' THEN (SELECT d.description FROM goods_receipts d WHERE d.id = sle.reference_id)",
    );
  });

  it("resolves STOCK_TAKE with a COALESCE fallback across purpose/conclusion/notes", () => {
    const sql = descriptionSql("sle");
    expect(sql).toContain(
      "WHEN 'STOCK_TAKE' THEN (SELECT COALESCE(d.purpose, d.conclusion, d.notes) FROM stock_takes d WHERE d.id = sle.reference_id)",
    );
  });

  it("has no arm for INVOICE — falls through to ELSE NULL", () => {
    const sql = descriptionSql("sle");
    expect(sql).not.toContain("WHEN 'INVOICE'");
    expect(sql.trim().endsWith("ELSE NULL END")).toBe(true);
  });
});
