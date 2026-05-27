import { useCallback, useMemo, useState } from "react";

import { useInvoiceListQuery } from "@erp/pos/hooks/react-query/use-query-invoice";
import {
  isInDateRange,
  type PosDateRangeFilterOption,
} from "@erp/pos/lib/common/dateRangeFilter";
import {
  EMPTY_INVOICE_LIST_FILTERS,
  INVOICE_LIST_COLUMN_ORDER,
  INVOICE_LIST_DEFAULT_PAGE_SIZE,
  InvoiceListColumnKey,
  type InvoiceListDateField,
} from "@erp/pos/constants/invoice-list.constant";
import type { InvoiceListRow } from "@erp/pos/interfaces/invoice.interface";

export type InvoiceListFilters = {
  -readonly [K in keyof typeof EMPTY_INVOICE_LIST_FILTERS]: string;
};

export interface UseInvoiceListResult {
  /** Pill khoảng thời gian ở filter bar. */
  dateRange: PosDateRangeFilterOption;
  setDateRange: (next: PosDateRangeFilterOption) => void;
  /** Lọc theo "Ngày tạo" hay "Ngày hóa đơn". */
  dateType: InvoiceListDateField;
  setDateType: (next: InvoiceListDateField) => void;
  /** Filter từng cột (text/number/status). */
  filters: InvoiceListFilters;
  setFilter: (key: keyof InvoiceListFilters, value: string) => void;
  /** Cột đang hiển thị + thao tác bật/tắt (qua modal). */
  visibleColumns: ReadonlySet<InvoiceListColumnKey>;
  columnSettingsOpen: boolean;
  openColumnSettings: () => void;
  closeColumnSettings: () => void;
  applyVisibleColumns: (next: ReadonlySet<InvoiceListColumnKey>) => void;
  /** Dữ liệu bảng (đã lọc + phân trang). */
  rows: ReadonlyArray<InvoiceListRow>;
  isLoading: boolean;
  grandTotal: number;
  /** Phân trang. */
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (next: number) => void;
  setPageSize: (next: number) => void;
  refetch: () => void;
  /** Hóa đơn đang xem biên lai (mở khi click số hóa đơn). */
  selectedInvoice: InvoiceListRow | null;
  openInvoice: (row: InvoiceListRow) => void;
  closeInvoice: () => void;
}

function matchesText(haystack: string, needle: string): boolean {
  if (!needle.trim()) return true;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function matchesNumberInput(value: number, raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  const target = Number.parseFloat(trimmed.replace(/[.,\s]/g, ""));
  if (!Number.isFinite(target)) return true;
  return value <= target;
}

/**
 * State machine cho trang `/invoices`. Sở hữu pill ngày + loại ngày, filter
 * từng cột, cột hiển thị (modal), phân trang, và hóa đơn đang xem biên lai.
 * Listing đến từ `GET /invoices` (`useInvoiceListQuery`); lọc + phân trang
 * làm client-side cho nhất quán với trang đổi trả.
 */
export function useInvoiceList(): UseInvoiceListResult {
  const query = useInvoiceListQuery();
  const data = useMemo(() => query.data ?? [], [query.data]);

  const [dateRange, setDateRangeState] =
    useState<PosDateRangeFilterOption>("TODAY");
  const [dateType, setDateTypeState] =
    useState<InvoiceListDateField>("createdAt");
  const [filters, setFilters] = useState<InvoiceListFilters>(() => ({
    ...EMPTY_INVOICE_LIST_FILTERS,
  }));
  const [visibleColumns, setVisibleColumns] = useState<Set<InvoiceListColumnKey>>(
    () => new Set(INVOICE_LIST_COLUMN_ORDER),
  );
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(INVOICE_LIST_DEFAULT_PAGE_SIZE);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceListRow | null>(
    null,
  );

  const filteredRows = useMemo(() => {
    return data.filter((row) => {
      const dateStr =
        dateType === "issuedAt" ? row.issuedAt ?? row.createdAt : row.createdAt;
      if (!isInDateRange(new Date(dateStr), dateRange)) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (!matchesText(row.code, filters.code)) return false;
      if (!matchesText(row.customerCode, filters.customerCode)) return false;
      if (!matchesText(row.customerName, filters.customerName)) return false;
      if (!matchesText(row.customerPhone, filters.customerPhone)) return false;
      if (!matchesText(row.note, filters.note)) return false;
      if (!matchesNumberInput(row.amount, filters.amount)) return false;
      return true;
    });
  }, [data, dateType, dateRange, filters]);

  const grandTotal = useMemo(
    () => filteredRows.reduce((sum, row) => sum + row.amount, 0),
    [filteredRows],
  );

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = useMemo(
    () => filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRows, safePage, pageSize],
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
    visibleColumns,
    columnSettingsOpen,
    openColumnSettings: useCallback(() => setColumnSettingsOpen(true), []),
    closeColumnSettings: useCallback(() => setColumnSettingsOpen(false), []),
    applyVisibleColumns,
    rows,
    isLoading: query.isLoading,
    grandTotal,
    page: safePage,
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
