/**
 * Fetcher mock của 2 lưới: lọc kỳ + chi nhánh + bộ lọc cột, tính tổng trên toàn
 * tập đã lọc rồi cắt trang — cùng hợp đồng một endpoint phân trang phía server.
 */
import {
  applyColumnFilter,
  type ColumnFilter,
} from "../../../../components/table/pagination.dto";
import { mockDelay } from "../../../orders/_mock/mockDelay";
import { getEInvoiceRecords } from "../_mock/einvoice.mock";
import { ISSUED_COLUMNS, UNISSUED_COLUMNS, type EInvoiceColumnDef } from "./einvoice-columns";
import type { EInvoiceListResult, EInvoiceRecord, EInvoiceTab } from "./einvoice.interface";

export interface EInvoiceListParams {
  tab: EInvoiceTab;
  from: string;
  to: string;
  branchId: string | null;
  columnFilters: Record<string, ColumnFilter>;
  page: number;
  pageSize: number;
}

function matchesDate(cell: string, filter: ColumnFilter): boolean {
  if (!filter.value) return true;
  if (!cell) return false;
  switch (filter.compareOp ?? "=") {
    case "<":
      return cell < filter.value;
    case "<=":
      return cell <= filter.value;
    case ">":
      return cell > filter.value;
    case ">=":
      return cell >= filter.value;
    default:
      return cell === filter.value;
  }
}

/** Ô `number-range` của BaseDataTable là chip `≤` cố định. */
function matchesNumber(cell: number, filter: ColumnFilter): boolean {
  if (!filter.value.trim()) return true;
  const limit = Number(filter.value);
  return Number.isNaN(limit) ? true : cell <= limit;
}

function matchesColumn(row: EInvoiceRecord, def: EInvoiceColumnDef, filter: ColumnFilter): boolean {
  const cell = def.value(row);
  switch (def.filterKind) {
    case "number-range":
      return matchesNumber(Number(cell), filter);
    case "date":
    case "date-compare":
      return matchesDate(String(cell), filter);
    case "select":
      return !filter.value || String(cell) === filter.value;
    case "none":
      return true;
    default:
      return applyColumnFilter(String(cell), filter);
  }
}

export function fetchEInvoices(params: EInvoiceListParams): Promise<EInvoiceListResult> {
  const issuedTab = params.tab === "issued";
  const columns = issuedTab ? ISSUED_COLUMNS : UNISSUED_COLUMNS;
  // Tab đã phát hành lọc kỳ theo ngày phát hành, tab chưa phát hành theo ngày bán.
  const dateOf = (r: EInvoiceRecord) => (issuedTab ? (r.issue?.issuedDate ?? "") : r.invoiceDate);

  const filtered = getEInvoiceRecords()
    .filter((r) => (issuedTab ? r.issue !== null : r.issue === null))
    .filter((r) => !params.branchId || r.branchId === params.branchId)
    .filter((r) => {
      const date = dateOf(r);
      return (!params.from || date >= params.from) && (!params.to || date <= params.to);
    })
    .filter((r) =>
      columns.every((def) => {
        const filter = params.columnFilters[def.key];
        return !filter || matchesColumn(r, def, filter);
      }),
    )
    // Ảnh chụp sắp giảm dần theo ngày (mũi tên ↓ ở cột ngày).
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || b.invoiceCode.localeCompare(a.invoiceCode));

  const start = (params.page - 1) * params.pageSize;
  return mockDelay({
    rows: filtered.slice(start, start + params.pageSize),
    total: filtered.length,
    totalAmount: filtered.reduce((acc, r) => acc + r.total, 0),
  });
}
