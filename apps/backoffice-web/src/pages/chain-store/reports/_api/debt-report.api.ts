import {
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

/** Scope filters for a debt report search — mirrors backend DebtReportFilterDto. */
export interface DebtReportFilterPayload {
  period?: { from?: string; to?: string };
  branchId?: string;
  customerId?: string;
  customerGroupId?: string;
  supplierId?: string;
  supplierGroupId?: string;
  groupBy?: "item" | "productTemplate";
}

export interface DebtReportSearchPayload {
  reportType: string;
  columns: string[];
  filters: DebtReportFilterPayload;
  columnFilters?: ColumnFilter[];
  page?: number;
  limit?: number;
}

// ===== API calls =====

export async function fetchDebtReportColumns(
  reportType: string,
  groupBy?: "item" | "productTemplate",
): Promise<InvoiceReportColumnsResult> {
  return requireErpData(
    await erpApi.GET<InvoiceReportColumnsResult>("/reports/debts/columns", {
      params: { query: { reportType, groupBy } },
    }),
  );
}

export async function fetchDebtReportData(
  payload: DebtReportSearchPayload,
): Promise<InvoiceReportResult> {
  return requireErpData(
    await erpApi.POST<InvoiceReportResult>("/reports/debts/search", {
      body: payload as unknown as Record<string, unknown>,
    }),
  );
}

// ===== Mappers: store filter → backend payload =====

export function buildDebtSearchFilters(
  filters: Partial<ReportFilterValues>,
  opts: { activeBranchId?: string | null } = {},
): DebtReportFilterPayload {
  const range = filters[REPORT_FILTERS_LINE.RANGE_DATE];
  const customer = filters[REPORT_FILTERS_LINE.CUSTOMER_SEARCH];
  const customerGroup = filters[REPORT_FILTERS_LINE.CUSTOMER_GROUP];
  const supplier = filters[REPORT_FILTERS_LINE.SUPPLIER];
  const supplierGroup = filters[REPORT_FILTERS_LINE.SUPPLIER_GROUP];
  const groupBy = filters[REPORT_FILTERS_LINE.STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE];
  // "Cửa hàng" filter phụ chỉ xuất hiện ở chế độ Chuỗi cửa hàng; khi xem theo 1
  // chi nhánh cụ thể ở header, branchId đến từ ngữ cảnh (activeBranchId), không
  // phải filter phụ (xem docs/24-debt-reports-spec.md #3/#4 — Phạm vi & quyền).
  const storeInChain = filters[REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL];

  const notAll = (v: string | undefined): v is string => !!v && v !== "all";

  const payload: DebtReportFilterPayload = {
    period: {
      from: range?.fromDate || undefined,
      to: range?.toDate || undefined,
    },
  };
  if (customer?.id) payload.customerId = customer.id;
  if (notAll(customerGroup)) payload.customerGroupId = customerGroup;
  if (supplier?.id) payload.supplierId = supplier.id;
  if (notAll(supplierGroup)) payload.supplierGroupId = supplierGroup;
  if (notAll(groupBy)) payload.groupBy = groupBy as "item" | "productTemplate";
  if (notAll(storeInChain)) payload.branchId = storeInChain;
  else if (opts.activeBranchId) payload.branchId = opts.activeBranchId;
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
// của invoice-report.api.ts (giữ bản riêng để module debt-report.api.ts độc lập).
export function buildDebtColumnFilters(
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
