import { useCallback, useMemo, useState } from "react";

import { useInvoiceListV2Query } from "@erp/pos/hooks/react-query/use-query-invoice";
import { dateRangeToISO, type PosDateRangeFilterOption } from "@erp/pos/lib/common/dateRangeFilter";
import { useDebounce } from "@erp/pos/hooks/common/use-debounce";
import {
  EMPTY_INVOICE_LIST_FILTERS,
  INVOICE_LIST_COLUMN_ORDER,
  INVOICE_LIST_DEFAULT_PAGE_SIZE,
  InvoiceListColumnKey,
  type InvoiceListDateField,
} from "@erp/pos/constants/invoice-list.constant";
import { FilterOperatorEnum } from "@erp/pos/constants/checkout.constant";
import type { SearchInvoicesV2Body } from "@erp/pos/dtos/invoice.dto";
import type { InvoiceListRow } from "@erp/pos/interfaces/invoice.interface";

export type InvoiceListFilters = {
  -readonly [K in keyof typeof EMPTY_INVOICE_LIST_FILTERS]: string;
};

/** Keys that carry a per-column operator selector (text + amount). */
export type InvoiceListOperatorKey =
  | "code"
  | "customerCode"
  | "customerName"
  | "customerPhone"
  | "note"
  | "amount";

export type InvoiceListFilterOperators = Record<
  InvoiceListOperatorKey,
  FilterOperatorEnum
>;

export const DEFAULT_INVOICE_LIST_OPERATORS: InvoiceListFilterOperators = {
  code:          FilterOperatorEnum.CONTAINS,
  customerCode:  FilterOperatorEnum.CONTAINS,
  customerName:  FilterOperatorEnum.CONTAINS,
  customerPhone: FilterOperatorEnum.CONTAINS,
  note:          FilterOperatorEnum.CONTAINS,
  amount:        FilterOperatorEnum.LESS_THAN_OR_EQUAL,
};

// ─── Operator mappings ───────────────────────────────────────────────────────

type StringOp  = "*" | "=" | "+" | "-" | "!";
type CompareOp = "=" | "<" | "<=" | ">" | ">=";

const TEXT_OP_MAP: Record<FilterOperatorEnum, StringOp> = {
  [FilterOperatorEnum.CONTAINS]:              "*",
  [FilterOperatorEnum.EQUALS]:                "=",
  [FilterOperatorEnum.STARTS_WITH]:           "+",
  [FilterOperatorEnum.ENDS_WITH]:             "-",
  [FilterOperatorEnum.NOT_CONTAINS]:          "!",
  [FilterOperatorEnum.LESS_THAN]:             "*",
  [FilterOperatorEnum.LESS_THAN_OR_EQUAL]:    "*",
  [FilterOperatorEnum.GREATER_THAN]:          "*",
  [FilterOperatorEnum.GREATER_THAN_OR_EQUAL]: "*",
};

const NUM_OP_MAP: Record<FilterOperatorEnum, CompareOp> = {
  [FilterOperatorEnum.EQUALS]:               "=",
  [FilterOperatorEnum.LESS_THAN]:            "<",
  [FilterOperatorEnum.LESS_THAN_OR_EQUAL]:   "<=",
  [FilterOperatorEnum.GREATER_THAN]:         ">",
  [FilterOperatorEnum.GREATER_THAN_OR_EQUAL]: ">=",
  [FilterOperatorEnum.CONTAINS]:             "=",
  [FilterOperatorEnum.STARTS_WITH]:          "=",
  [FilterOperatorEnum.ENDS_WITH]:            "=",
  [FilterOperatorEnum.NOT_CONTAINS]:         "=",
};

// ─── Hook interface ──────────────────────────────────────────────────────────

export interface UseInvoiceListResult {
  dateRange: PosDateRangeFilterOption;
  setDateRange: (next: PosDateRangeFilterOption) => void;
  dateType: InvoiceListDateField;
  setDateType: (next: InvoiceListDateField) => void;
  filters: InvoiceListFilters;
  setFilter: (key: keyof InvoiceListFilters, value: string) => void;
  filterOperators: InvoiceListFilterOperators;
  setFilterOperator: (key: InvoiceListOperatorKey, op: FilterOperatorEnum) => void;
  visibleColumns: ReadonlySet<InvoiceListColumnKey>;
  columnSettingsOpen: boolean;
  openColumnSettings: () => void;
  closeColumnSettings: () => void;
  applyVisibleColumns: (next: ReadonlySet<InvoiceListColumnKey>) => void;
  rows: ReadonlyArray<InvoiceListRow>;
  isLoading: boolean;
  grandTotal: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (next: number) => void;
  setPageSize: (next: number) => void;
  refetch: () => void;
  selectedInvoice: InvoiceListRow | null;
  openInvoice: (row: InvoiceListRow) => void;
  closeInvoice: () => void;
}

/**
 * State machine cho trang `/invoices`. Lọc và phân trang được thực hiện
 * server-side qua POST /v2/invoices/search. Text filter được debounce 300 ms
 * để giảm số lần gọi API khi gõ.
 */
export function useInvoiceList(): UseInvoiceListResult {
  const [dateRange, setDateRangeState] =
    useState<PosDateRangeFilterOption>("TODAY");
  const [dateType, setDateTypeState] =
    useState<InvoiceListDateField>("createdAt");
  const [filters, setFilters] = useState<InvoiceListFilters>(() => ({
    ...EMPTY_INVOICE_LIST_FILTERS,
  }));
  const [filterOperators, setFilterOperators] =
    useState<InvoiceListFilterOperators>(() => ({ ...DEFAULT_INVOICE_LIST_OPERATORS }));
  const [visibleColumns, setVisibleColumns] = useState<Set<InvoiceListColumnKey>>(
    () => new Set(INVOICE_LIST_COLUMN_ORDER),
  );
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(INVOICE_LIST_DEFAULT_PAGE_SIZE);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceListRow | null>(null);

  // Debounce only text values to avoid a server query on every keystroke.
  const debouncedText = useDebounce({
    code:          filters.code,
    customerCode:  filters.customerCode,
    customerName:  filters.customerName,
    customerPhone: filters.customerPhone,
    note:          filters.note,
  });

  const searchBody = useMemo<SearchInvoicesV2Body>(() => {
    const dateFilter = dateRangeToISO(dateRange);
    const hasDate = Boolean(dateFilter.from ?? dateFilter.to);

    const strFilter = (val: string, opKey: keyof typeof filterOperators) => {
      if (!val.trim()) return undefined;
      return { operator: TEXT_OP_MAP[filterOperators[opKey]], value: val.trim() };
    };

    const rawAmount = filters.amount.trim();
    const numericAmount = rawAmount
      ? parseFloat(rawAmount.replace(/[.,\s]/g, ""))
      : NaN;

    return {
      page,
      limit: pageSize,
      code:          strFilter(debouncedText.code,          "code"),
      customerCode:  strFilter(debouncedText.customerCode,  "customerCode"),
      customerName:  strFilter(debouncedText.customerName,  "customerName"),
      customerPhone: strFilter(debouncedText.customerPhone, "customerPhone"),
      note:          strFilter(debouncedText.note,          "note"),
      status:  filters.status ? { value: filters.status } : undefined,
      amountDue:
        Number.isFinite(numericAmount)
          ? { operator: NUM_OP_MAP[filterOperators.amount], value: numericAmount }
          : undefined,
      ...(hasDate ? { [dateType]: dateFilter } : {}),
    };
  }, [page, pageSize, filters.status, filters.amount, filterOperators, debouncedText, dateRange, dateType]);

  const query = useInvoiceListV2Query(searchBody);

  const rows       = query.data?.rows  ?? [];
  const total      = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const grandTotal = useMemo(
    () => rows.reduce((sum, row) => sum + row.amount, 0),
    [rows],
  );

  const setDateRange = useCallback((next: PosDateRangeFilterOption) => {
    setDateRangeState(next);
    setPageState(1);
  }, []);

  const setDateType = useCallback((next: InvoiceListDateField) => {
    setDateTypeState(next);
    setPageState(1);
  }, []);

  const setFilter = useCallback<UseInvoiceListResult["setFilter"]>(
    (key, value) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPageState(1);
    },
    [],
  );

  const setFilterOperator = useCallback(
    (key: InvoiceListOperatorKey, op: FilterOperatorEnum) => {
      setFilterOperators((prev) => ({ ...prev, [key]: op }));
      setPageState(1);
    },
    [],
  );

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(next);
    setPageState(1);
  }, []);

  const applyVisibleColumns = useCallback(
    (next: ReadonlySet<InvoiceListColumnKey>) => {
      setVisibleColumns(new Set(next));
      setColumnSettingsOpen(false);
    },
    [],
  );

  return {
    dateRange,
    setDateRange,
    dateType,
    setDateType,
    filters,
    setFilter,
    filterOperators,
    setFilterOperator,
    visibleColumns,
    columnSettingsOpen,
    openColumnSettings: useCallback(() => setColumnSettingsOpen(true), []),
    closeColumnSettings: useCallback(() => setColumnSettingsOpen(false), []),
    applyVisibleColumns,
    rows,
    isLoading: query.isLoading,
    grandTotal,
    page: Math.min(page, totalPages),
    pageSize,
    total,
    totalPages,
    setPage: setPageState,
    setPageSize,
    refetch: useCallback(() => void query.refetch(), [query]),
    selectedInvoice,
    openInvoice: useCallback((row: InvoiceListRow) => setSelectedInvoice(row), []),
    closeInvoice: useCallback(() => setSelectedInvoice(null), []),
  };
}
