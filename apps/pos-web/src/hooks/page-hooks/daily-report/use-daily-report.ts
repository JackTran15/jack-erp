import { useCallback, useEffect, useMemo, useState } from "react";
import { PosDailySummaryDetailCategory, ReportGroupBy } from "@erp/shared-interfaces";
import type {
  ColumnFilter,
  InvoiceReportSearchPayload,
  ReportDateRangeFilter,
} from "@erp/shared-interfaces";

import {
  useDailySummaryQuery,
  useRevenueByItemReportQuery,
} from "@erp/pos/hooks/react-query/use-query-daily-report";
import { useDebounce } from "@erp/pos/hooks/common/use-debounce";
import {
  dateRangeToISO,
  type PosDateRangeFilterOption,
} from "@erp/pos/lib/common/dateRangeFilter";
import {
  FilterOperatorEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  DAILY_REPORT_DEFAULT_PAGE_SIZE,
  DAILY_REPORT_REVENUE_COLUMN_ORDER,
  DAILY_REPORT_REVENUE_NUMERIC_COLUMNS,
  DailyReportRevenueColumnKey,
  EMPTY_REVENUE_COLUMN_FILTERS,
} from "@erp/pos/constants/daily-report.constant";
import type { DailyReportTab } from "@erp/pos/types/daily-report.type";
import type {
  PosDailySummaryBody,
  RevenueByItemExportBody,
} from "@erp/pos/dtos/daily-report.dto";
import type {
  CashCountState,
  CashHandoverForm,
} from "@erp/pos/interfaces/daily-report.interface";

const EMPTY_HANDOVER: CashHandoverForm = {
  openingAmount: 0,
  receivedFromId: null,
  handoverAmount: 0,
  handedOverToId: null,
  note: "",
};

const DEFAULT_REVENUE_FILTER_OPERATORS: Record<
  DailyReportRevenueColumnKey,
  FilterOperatorEnum
> = Object.fromEntries(
  DAILY_REPORT_REVENUE_COLUMN_ORDER.map((key) => [
    key,
    DAILY_REPORT_REVENUE_NUMERIC_COLUMNS.has(key)
      ? FilterOperatorEnum.EQUALS
      : FilterOperatorEnum.CONTAINS,
  ]),
) as Record<DailyReportRevenueColumnKey, FilterOperatorEnum>;

/** Map a text-column operator + raw value to the report API's `ColumnFilter` shape. */
function toTextColumnFilter(
  col: string,
  op: FilterOperatorEnum,
  value: string,
): ColumnFilter {
  switch (op) {
    case FilterOperatorEnum.EQUALS:
      return { col, equals: value };
    case FilterOperatorEnum.STARTS_WITH:
      return { col, startsWith: value };
    case FilterOperatorEnum.ENDS_WITH:
      return { col, endsWith: value };
    case FilterOperatorEnum.NOT_CONTAINS:
      return { col, notContains: value };
    default:
      return { col, contains: value };
  }
}

/** Map a numeric-column operator + parsed value to the report API's `ColumnFilter` shape. */
function toNumericColumnFilter(
  col: string,
  op: FilterOperatorEnum,
  value: number,
): ColumnFilter {
  switch (op) {
    case FilterOperatorEnum.LESS_THAN:
      return { col, lt: value };
    case FilterOperatorEnum.LESS_THAN_OR_EQUAL:
      return { col, lte: value };
    case FilterOperatorEnum.GREATER_THAN:
      return { col, gt: value };
    case FilterOperatorEnum.GREATER_THAN_OR_EQUAL:
      return { col, gte: value };
    default:
      return { col, eq: value };
  }
}

export function useDailyReport() {
  const [activeTab, setActiveTab] = useState<DailyReportTab>("summary");

  // ── Shared filters (both tabs) ─────────────────────────────────────────────
  const [dateRange, setDateRangeState] =
    useState<PosDateRangeFilterOption>("TODAY");
  const [customRange, setCustomRange] = useState<ReportDateRangeFilter>({});
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [cashierId, setCashierIdState] = useState<string | null>(null);
  const [salespersonId, setSalespersonIdState] = useState<string | null>(null);

  // ── TAB 2 pagination + columns ───────────────────────────────────────────────
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(DAILY_REPORT_DEFAULT_PAGE_SIZE);
  const [visibleRevenueColumns, setVisibleRevenueColumns] = useState<
    Set<DailyReportRevenueColumnKey>
  >(() => new Set(DAILY_REPORT_REVENUE_COLUMN_ORDER));
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [revenueFilters, setRevenueFilters] = useState<
    Record<DailyReportRevenueColumnKey, string>
  >(() => ({ ...EMPTY_REVENUE_COLUMN_FILTERS }));
  const [revenueFilterOperators, setRevenueFilterOperators] = useState<
    Record<DailyReportRevenueColumnKey, FilterOperatorEnum>
  >(() => ({ ...DEFAULT_REVENUE_FILTER_OPERATORS }));

  // ── BÀN GIAO TIỀN (FE-only) ──────────────────────────────────────────────────
  const [handover, setHandover] = useState<CashHandoverForm>(EMPTY_HANDOVER);
  const [cashCount, setCashCount] = useState<CashCountState>({});
  const [cashCountOpen, setCashCountOpen] = useState(false);

  // ── "Xem chi tiết" drill-down modal (Tab Tổng hợp) ───────────────────────────
  const [detailCategory, setDetailCategory] = useState<PosDailySummaryDetailCategory | null>(
    null,
  );

  const issuedAt = useMemo<ReportDateRangeFilter>(
    () =>
      dateRange === "OTHER"
        ? customRange
        : dateRangeToISO(dateRange, undefined, customRange),
    [dateRange, customRange],
  );

  // Debounce only the typed values so a server query doesn't fire per keystroke.
  const debouncedRevenueFilters = useDebounce(revenueFilters, 300);

  const columnFilters = useMemo<ColumnFilter[]>(() => {
    const list: ColumnFilter[] = [];
    for (const key of DAILY_REPORT_REVENUE_COLUMN_ORDER) {
      const raw = debouncedRevenueFilters[key]?.trim();
      if (!raw) continue;
      if (DAILY_REPORT_REVENUE_NUMERIC_COLUMNS.has(key)) {
        const num = parseFloat(raw.replace(/[.,\s]/g, ""));
        if (Number.isFinite(num)) {
          list.push(toNumericColumnFilter(key, revenueFilterOperators[key], num));
        }
      } else {
        list.push(toTextColumnFilter(key, revenueFilterOperators[key], raw));
      }
    }
    return list;
  }, [debouncedRevenueFilters, revenueFilterOperators]);

  // ── Requests ─────────────────────────────────────────────────────────────────
  const summaryBody = useMemo<PosDailySummaryBody>(
    () => ({
      issuedAt,
      cashierId: cashierId ?? undefined,
      salespersonId: salespersonId ?? undefined,
    }),
    [issuedAt, cashierId, salespersonId],
  );

  const revenueBody = useMemo<InvoiceReportSearchPayload>(
    () => ({
      reportType: "revenue-by-item",
      columns: [...DAILY_REPORT_REVENUE_COLUMN_ORDER],
      filters: {
        issuedAt,
        statBy: ReportGroupBy.ITEM,
        cashierId: cashierId ?? undefined,
        salespersonId: salespersonId ?? undefined,
      },
      columnFilters: columnFilters.length ? columnFilters : undefined,
      page,
      limit: pageSize,
    }),
    [issuedAt, cashierId, salespersonId, columnFilters, page, pageSize],
  );

  // In/Xuất always cover the whole filtered set (no page/limit), and only the
  // columns currently visible on screen — matching the invoice-report engine's
  // own export/print-payload contract used elsewhere in the ERP.
  const revenueExportBody = useMemo<RevenueByItemExportBody>(
    () => ({
      reportType: "revenue-by-item",
      columns: DAILY_REPORT_REVENUE_COLUMN_ORDER.filter((key) =>
        visibleRevenueColumns.has(key),
      ),
      filters: {
        issuedAt,
        statBy: ReportGroupBy.ITEM,
        cashierId: cashierId ?? undefined,
        salespersonId: salespersonId ?? undefined,
      },
      columnFilters: columnFilters.length ? columnFilters : undefined,
    }),
    [issuedAt, cashierId, salespersonId, columnFilters, visibleRevenueColumns],
  );

  const summaryQuery = useDailySummaryQuery(summaryBody);
  const revenueQuery = useRevenueByItemReportQuery(revenueBody);

  // "Tiền bàn giao" defaults so Chênh lệch (openingAmount + revenue.cash −
  // expense.cash − handoverAmount) stays at 0 — recomputed whenever a filter
  // change lands new summary data, or the user edits "Số tiền bàn giao từ
  // ban đầu" (debounced so it settles after typing stops, not per keystroke).
  // Still user-editable afterward (typed directly or via "Chi tiết kiểm đếm").
  const debouncedOpeningAmount = useDebounce(handover.openingAmount, 400);
  useEffect(() => {
    if (!summaryQuery.data) return;
    const { revenue, expense } = summaryQuery.data;
    const handoverAmount =
      Math.round((debouncedOpeningAmount + revenue.cash - expense.cash) * 100) / 100;
    setHandover((p) => ({ ...p, handoverAmount }));
  }, [debouncedOpeningAmount, summaryQuery.data]);

  const total = revenueQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ── Filter setters reset pagination ───────────────────────────────────────────
  const resetPage = () => setPageState(1);
  const setDateRange = useCallback((next: PosDateRangeFilterOption) => {
    setDateRangeState(next);
    resetPage();
  }, []);
  const setCashierId = useCallback((next: string | null) => {
    setCashierIdState(next);
    resetPage();
  }, []);
  const setSalespersonId = useCallback((next: string | null) => {
    setSalespersonIdState(next);
    resetPage();
  }, []);
  const applyCustomRange = useCallback((next: ReportDateRangeFilter) => {
    setCustomRange(next);
    setDateRangeState("OTHER");
    setCustomRangeOpen(false);
    resetPage();
  }, []);
  const setPageSize = useCallback((next: number) => {
    setPageSizeState(next);
    resetPage();
  }, []);

  const setRevenueFilter = useCallback(
    (key: DailyReportRevenueColumnKey, value: string) => {
      setRevenueFilters((prev) => ({ ...prev, [key]: value }));
      resetPage();
    },
    [],
  );
  const setRevenueFilterOperator = useCallback(
    (key: DailyReportRevenueColumnKey, op: FilterOperatorEnum) => {
      setRevenueFilterOperators((prev) => ({ ...prev, [key]: op }));
      resetPage();
    },
    [],
  );
  const applyVisibleRevenueColumns = useCallback(
    (next: ReadonlySet<DailyReportRevenueColumnKey>) => {
      setVisibleRevenueColumns(new Set(next));
      setColumnSettingsOpen(false);
    },
    [],
  );

  return {
    activeTab,
    setActiveTab,

    issuedAt,
    dateRange,
    setDateRange,
    customRange,
    customRangeOpen,
    openCustomRange: useCallback(() => setCustomRangeOpen(true), []),
    closeCustomRange: useCallback(() => setCustomRangeOpen(false), []),
    applyCustomRange,

    cashierId,
    setCashierId,
    salespersonId,
    setSalespersonId,

    // Tab Tổng hợp
    summary: summaryQuery.data ?? null,
    summaryLoading: summaryQuery.isLoading,
    refetchSummary: useCallback(() => void summaryQuery.refetch(), [summaryQuery]),

    // Tab Doanh thu theo mặt hàng
    rows: revenueQuery.data?.rows ?? [],
    totalsRow: revenueQuery.data?.totals ?? null,
    revenueLoading: revenueQuery.isLoading,
    page: Math.min(page, totalPages),
    pageSize,
    total,
    totalPages,
    setPage: setPageState,
    setPageSize,
    refetchRevenue: useCallback(() => void revenueQuery.refetch(), [revenueQuery]),
    revenueFilters,
    revenueFilterOperators,
    setRevenueFilter,
    setRevenueFilterOperator,
    visibleRevenueColumns,
    columnSettingsOpen,
    openColumnSettings: useCallback(() => setColumnSettingsOpen(true), []),
    closeColumnSettings: useCallback(() => setColumnSettingsOpen(false), []),
    applyVisibleRevenueColumns,
    revenueExportBody,

    // BÀN GIAO TIỀN
    handover,
    setHandover,
    cashCount,
    setCashCount,
    cashCountOpen,
    openCashCount: useCallback(() => setCashCountOpen(true), []),
    closeCashCount: useCallback(() => setCashCountOpen(false), []),

    // "Xem chi tiết" drill-down modal
    detailCategory,
    openDetail: useCallback((category: PosDailySummaryDetailCategory) => {
      setDetailCategory(category);
    }, []),
    closeDetail: useCallback(() => setDetailCategory(null), []),
  };
}
