import { describe, expect, it } from "vitest";
import {
  TempWarehouseDirection,
  TempWarehouseLine,
  TempWarehouseLineStatus,
} from "@erp/shared-interfaces";
import {
  isLineSaleTransferred,
  lineMatchesTableFilters,
} from "./temp-warehouse-mappers";
import type { FastStockTransferFilters } from "@erp/pos/interfaces/fast-stock-transfer.interface";

/**
 * AC-06 (UOW-01, exchange-temp-warehouse-fulfill). A staged line consumed by an
 * invoice must drop out of the "dòng cần kiểm tra" list — that is what tells the
 * stock clerk the goods are sold rather than still waiting to be moved.
 *
 * Before the fix, an EXCHANGE never stamped invoiceId onto the line, so a sold
 * item sat in this list forever (production, MT 211 Lê Duẩn, YMT25017-D-38).
 * The filter itself was always right; these tests pin the contract it depends on.
 */
const line = (overrides: Partial<TempWarehouseLine> = {}): TempWarehouseLine =>
  ({
    id: "line-1",
    organizationId: "org-1",
    branchId: "branch-1",
    sessionId: "session-1",
    itemId: "item-1",
    direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
    quantity: "1.00",
    carrierUserId: null,
    status: TempWarehouseLineStatus.ACTIVE,
    supersededById: null,
    notes: null,
    sourceLocationId: null,
    invoiceId: null,
    invoiceNumber: null,
    createdAt: "2026-08-19T07:11:00.000Z",
    updatedAt: "2026-08-19T07:11:00.000Z",
    createdBy: "user-1",
    ...overrides,
  }) as TempWarehouseLine;

const filters = (
  showRowsNeedingReview: boolean,
): FastStockTransferFilters => ({
  sourceWarehouse: "",
  destinationWarehouse: "",
  transporter: "",
  location: "",
  unit: "",
  productName: "",
  sku: "",
  showRowsNeedingReview,
});

const consumed = line({
  status: TempWarehouseLineStatus.TRANSFERRED,
  invoiceId: "exchange-invoice-1",
  invoiceNumber: "RET-202608-00007",
});

describe("temp-warehouse line review filter (AC-06)", () => {
  it("treats a TRANSFERRED line carrying an invoice as sale-consumed", () => {
    expect(isLineSaleTransferred(consumed)).toBe(true);
  });

  it("hides a sale-consumed line when 'dòng cần kiểm tra' is ticked", () => {
    expect(lineMatchesTableFilters(consumed, filters(true), new Set())).toBe(
      false,
    );
  });

  it("still shows it when the tick is off, so the invoice number stays readable", () => {
    expect(lineMatchesTableFilters(consumed, filters(false), new Set())).toBe(
      true,
    );
  });

  it("keeps an unconsumed staged line in the review list — the pre-fix state", () => {
    // Exactly what the screenshot showed: ACTIVE, no invoice, still demanding
    // review even though the goods had already been sold on an exchange.
    const staged = line();
    expect(isLineSaleTransferred(staged)).toBe(false);
    expect(lineMatchesTableFilters(staged, filters(true), new Set())).toBe(true);
  });

  it("does not count a TRANSFERRED line without an invoice as sale-consumed", () => {
    // Lines moved by the ordinary "Xử lý chuyển kho" batch also end TRANSFERRED
    // but carry no invoice — they must not be mistaken for a sale.
    const batchMoved = line({ status: TempWarehouseLineStatus.TRANSFERRED });
    expect(isLineSaleTransferred(batchMoved)).toBe(false);
  });
});
