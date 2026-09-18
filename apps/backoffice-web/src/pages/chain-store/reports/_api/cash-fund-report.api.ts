import {
  type CashFundKind,
  type CashFundTimeBucket,
  type ColumnFilter,
  type InvoiceReportColumnsResult,
  type InvoiceReportResult,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../../../lib/erp-api";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import type {
  ReportColumnFilter,
  ReportFilterValues,
} from "../../../../store/page-stores/report/report.interface";

/** Scope filters for a cash-fund report search — mirrors backend CashFundReportFilterDto. */
export interface CashFundReportFilterPayload {
  period?: { from?: string; to?: string };
  /** Chi nhánh header — #2/#4/#6 (A-14). */
  branchId?: string;
  /** Phạm vi nhiều cửa hàng — #3/#5. */
  store?: { scope: "all" | "group"; storeIds: string[] };
  employeeIds?: string[];
  paymentMethod?: CashFundKind;
  categoryIds?: string[];
  fundKind?: CashFundKind;
  timeBucket?: CashFundTimeBucket;
}

export interface CashFundReportSearchPayload {
  reportType: string;
  columns: string[];
  filters: CashFundReportFilterPayload;
  columnFilters?: ColumnFilter[];
  page?: number;
  limit?: number;
}

// ===== API calls =====

export async function fetchCashFundReportColumns(
  reportType: string,
): Promise<InvoiceReportColumnsResult> {
  return requireErpData(
    await erpApi.GET<InvoiceReportColumnsResult>("/reports/cash-fund/columns", {
      params: { query: { reportType } },
    }),
  );
}

export async function fetchCashFundReportData(
  payload: CashFundReportSearchPayload,
): Promise<InvoiceReportResult> {
  return requireErpData(
    await erpApi.POST<InvoiceReportResult>("/reports/cash-fund/search", {
      body: payload as unknown as Record<string, unknown>,
    }),
  );
}

// ===== Mappers: store filter → backend payload =====

/**
 * Kỳ báo cáo đã được FE resolve từ preset sang from/to (A-09). Chi nhánh: #2/#4/#6
 * không có filter cửa hàng nên lấy chi nhánh header (`activeBranchId`, null khi
 * xem theo Chuỗi → BE gộp theo quyền hợp nhất); #3/#5 gửi `store` từ filter
 * phụ. #3: EMPLOYEE → `employeeIds` (1 phần tử), PAYMENT_METHOD → `paymentMethod`;
 * rỗng = Tất cả → bỏ khỏi payload. EXPENSE_CATEGORY / bucket được UOW-03 bổ sung.
 */
export function buildCashFundSearchFilters(
  filters: Partial<ReportFilterValues>,
  opts: { activeBranchId?: string | null } = {},
): CashFundReportFilterPayload {
  const range = filters[REPORT_FILTERS_LINE.RANGE_DATE];
  const store = filters[REPORT_FILTERS_LINE.STORE];
  const employee = filters[REPORT_FILTERS_LINE.EMPLOYEE];
  const paymentMethod = filters[REPORT_FILTERS_LINE.PAYMENT_METHOD];

  const notAll = (v: string | undefined): v is string => !!v && v !== "all";

  const payload: CashFundReportFilterPayload = {
    period: {
      from: range?.fromDate || undefined,
      to: range?.toDate || undefined,
    },
  };
  if (store?.scope) {
    payload.store = { scope: store.scope, storeIds: store.storeIds ?? [] };
  } else if (opts.activeBranchId) {
    payload.branchId = opts.activeBranchId;
  }
  if (notAll(employee)) payload.employeeIds = [employee];
  if (paymentMethod) payload.paymentMethod = paymentMethod;
  return payload;
}

const TEXT_OPERATORS = new Set([
  "contains",
  "equals",
  "startsWith",
  "endsWith",
  "notContains",
]);
const COMPARE_FIELD: Record<string, "eq" | "lt" | "lte" | "gt" | "gte"> = {
  "=": "eq",
  "<": "lt",
  "<=": "lte",
  ">": "gt",
  ">=": "gte",
};

// Column filter (chip header) → backend columnFilters. Cùng logic buildColumnFilters
// của invoice-report.api.ts (giữ bản riêng để module cash-fund-report.api.ts độc lập).
export function buildCashFundColumnFilters(
  columnFilters: Record<string, ReportColumnFilter>,
  numericCols: Set<string>,
): ColumnFilter[] {
  const out: ColumnFilter[] = [];
  for (const [col, filter] of Object.entries(columnFilters)) {
    const value = filter.value.trim();
    if (!value) continue;
    const op = filter.operator;
    if (TEXT_OPERATORS.has(op)) {
      out.push({ col, [op]: value } as ColumnFilter);
    } else if (numericCols.has(col)) {
      const field = COMPARE_FIELD[op] ?? "eq";
      out.push({ col, [field]: Number(value) } as ColumnFilter);
    } else if (op === "=") {
      out.push({ col, eq: value });
    } else if (op === "<" || op === "<=") {
      out.push({ col, to: value });
    } else if (op === ">" || op === ">=") {
      out.push({ col, from: value });
    }
  }
  return out;
}
