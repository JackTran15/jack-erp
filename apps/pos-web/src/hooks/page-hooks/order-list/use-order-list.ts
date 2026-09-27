import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useDebounce } from "@erp/pos/hooks/common/use-debounce";
import { useInvoiceDetailQuery } from "@erp/pos/hooks/react-query/use-query-invoice";
import { useSearchSalesOrdersQuery } from "@erp/pos/hooks/react-query/use-query-sales-order";
import { INVOICE_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { mapInvoiceRowToDraftInvoice } from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";
import {
  dateRangeToISO,
  type PosDateRangeFilterOption,
} from "@erp/pos/lib/common/dateRangeFilter";
import { parseViDate } from "@erp/pos/lib/common/dateTime";
import { FilterOperatorEnum } from "@erp/pos/constants/checkout.constant";
import {
  EMPTY_ORDER_FILTERS,
  ORDER_DATE_FILTER_KEYS,
  ORDER_LIST_PAGE_SIZE,
  ORDER_NUMBER_FILTER_KEYS,
  ORDER_STOCK_SHORT_LABEL,
  ORDER_TEXT_FILTER_KEYS,
  type OrderDateField,
  type OrderTab,
} from "@erp/pos/constants/order-list.constant";
import type {
  CompareFilter,
  DateRangeFilter,
  StringFilter,
} from "@erp/pos/dtos/invoice.dto";
import type {
  SalesOrderColumnFilters,
  SearchSalesOrdersBody,
} from "@erp/pos/dtos/sales-order.dto";
import type { DeliveryOrderRow } from "@erp/pos/interfaces/sales-order.interface";

export type OrderFilters = {
  -readonly [K in keyof typeof EMPTY_ORDER_FILTERS]: string;
};

/** Ô lọc có bộ chọn toán tử (ngày / chữ / số). Ba ô select thì không. */
export type OrderOperatorKey =
  | (typeof ORDER_DATE_FILTER_KEYS)[number]
  | (typeof ORDER_TEXT_FILTER_KEYS)[number]
  | (typeof ORDER_NUMBER_FILTER_KEYS)[number];

export type OrderFilterOperators = Record<OrderOperatorKey, FilterOperatorEnum>;

const DEFAULT_OPERATORS: OrderFilterOperators = {
  ...Object.fromEntries(
    ORDER_TEXT_FILTER_KEYS.map((k) => [k, FilterOperatorEnum.CONTAINS]),
  ),
  ...Object.fromEntries(
    [...ORDER_DATE_FILTER_KEYS, ...ORDER_NUMBER_FILTER_KEYS].map((k) => [
      k,
      FilterOperatorEnum.LESS_THAN_OR_EQUAL,
    ]),
  ),
} as OrderFilterOperators;

// ─── Operator mappings (giống use-invoice-list / use-online-order-list) ─────

const TEXT_OP_MAP: Record<FilterOperatorEnum, StringFilter["operator"]> = {
  [FilterOperatorEnum.CONTAINS]: "*",
  [FilterOperatorEnum.EQUALS]: "=",
  [FilterOperatorEnum.STARTS_WITH]: "+",
  [FilterOperatorEnum.ENDS_WITH]: "-",
  [FilterOperatorEnum.NOT_CONTAINS]: "!",
  [FilterOperatorEnum.LESS_THAN]: "*",
  [FilterOperatorEnum.LESS_THAN_OR_EQUAL]: "*",
  [FilterOperatorEnum.GREATER_THAN]: "*",
  [FilterOperatorEnum.GREATER_THAN_OR_EQUAL]: "*",
};

const NUM_OP_MAP: Record<FilterOperatorEnum, CompareFilter["operator"]> = {
  [FilterOperatorEnum.EQUALS]: "=",
  [FilterOperatorEnum.LESS_THAN]: "<",
  [FilterOperatorEnum.LESS_THAN_OR_EQUAL]: "<=",
  [FilterOperatorEnum.GREATER_THAN]: ">",
  [FilterOperatorEnum.GREATER_THAN_OR_EQUAL]: ">=",
  [FilterOperatorEnum.CONTAINS]: "=",
  [FilterOperatorEnum.STARTS_WITH]: "=",
  [FilterOperatorEnum.ENDS_WITH]: "=",
  [FilterOperatorEnum.NOT_CONTAINS]: "=",
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "dd/mm/yyyy" + lệch `delta` ngày → "YYYY-MM-DD"; sai định dạng → null. */
function viDateToISO(raw: string, delta = 0): string | null {
  const d = parseViDate(raw);
  if (!d) return null;
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Ô ngày → `DateRangeFilter`. Server hiểu `YYYY-MM-DD` là trọn một ngày giờ
 * VN, nên `≤ d` = `to: d`, `< d` = `to: d-1`, `= d` = cả ngày d.
 */
function dateColumnFilter(
  raw: string,
  op: FilterOperatorEnum,
): DateRangeFilter | undefined {
  const day = viDateToISO(raw);
  if (!day) return undefined;
  switch (op) {
    case FilterOperatorEnum.LESS_THAN_OR_EQUAL:
      return { to: day };
    case FilterOperatorEnum.LESS_THAN:
      return { to: viDateToISO(raw, -1) ?? day };
    case FilterOperatorEnum.GREATER_THAN_OR_EQUAL:
      return { from: day };
    case FilterOperatorEnum.GREATER_THAN:
      return { from: viDateToISO(raw, 1) ?? day };
    default:
      return { from: day, to: day };
  }
}

/** Ô lọc cột → `columnFilters` của body (chỉ ô có giá trị hợp lệ). */
function buildColumnFilters(
  filters: OrderFilters,
  operators: OrderFilterOperators,
): SalesOrderColumnFilters {
  const out: SalesOrderColumnFilters = {};
  for (const key of ORDER_DATE_FILTER_KEYS) {
    const range = dateColumnFilter(filters[key], operators[key]);
    if (range) out[key] = range;
  }
  for (const key of ORDER_TEXT_FILTER_KEYS) {
    const value = filters[key].trim();
    if (value) out[key] = { operator: TEXT_OP_MAP[operators[key]], value };
  }
  for (const key of ORDER_NUMBER_FILTER_KEYS) {
    const raw = filters[key].trim();
    const value = raw ? parseFloat(raw.replace(/[.,\s]/g, "")) : NaN;
    if (Number.isFinite(value)) {
      out[key] = { operator: NUM_OP_MAP[operators[key]], value };
    }
  }
  if (filters.deliveryStatus) {
    out.deliveryStatus = { value: filters.deliveryStatus };
  }
  return out;
}

// ─── Hook interface ──────────────────────────────────────────────────────────

export interface UseOrderListResult {
  tab: OrderTab;
  setTab: (next: OrderTab) => void;
  dateField: OrderDateField;
  setDateField: (next: OrderDateField) => void;
  datePreset: PosDateRangeFilterOption;
  setDatePreset: (next: PosDateRangeFilterOption) => void;
  filters: OrderFilters;
  /** Cũng dùng cho "Chọn nhãn" trên thanh lọc (`label`) — cùng một state với ô lọc cột Nhãn. */
  setFilter: (key: keyof OrderFilters, value: string) => void;
  filterOperators: OrderFilterOperators;
  setFilterOperator: (key: OrderOperatorKey, op: FilterOperatorEnum) => void;
  rows: ReadonlyArray<DeliveryOrderRow>;
  isLoading: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (next: number) => void;
  refetch: () => void;
  /** Ô tick — nguồn cho các action giao hàng (UOW-05 nối vào `OrderToolbar`). */
  selectedIds: ReadonlySet<string>;
  selectedRows: ReadonlyArray<DeliveryOrderRow>;
  toggleRow: (id: string) => void;
  toggleAllRows: () => void;
  /** Gọi sau khi một action batch xong để bỏ tick các đơn đã đổi trạng thái. */
  clearSelection: () => void;
}

/**
 * State cho trang `/orders`: tab + loại ngày + khoảng ngày + nhãn + lọc cột →
 * `POST /v2/mobile/sales-orders/search` (view DELIVERY, `limit` 100). Lọc và
 * phân trang chạy server-side; ô lọc gõ tay được debounce. Mọi thay đổi bộ
 * lọc / trang đưa về trang 1 và bỏ chọn các dòng đã tick.
 */
export function useOrderList(): UseOrderListResult {
  const [tab, setTabState] = useState<OrderTab>("");
  const [dateField, setDateFieldState] = useState<OrderDateField>("CREATED");
  const [datePreset, setDatePresetState] =
    useState<PosDateRangeFilterOption>("LAST_7_DAYS");
  const [filters, setFilters] = useState<OrderFilters>(() => ({
    ...EMPTY_ORDER_FILTERS,
  }));
  const [filterOperators, setFilterOperators] = useState<OrderFilterOperators>(
    () => ({ ...DEFAULT_OPERATORS }),
  );
  const [page, setPageState] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // "Khác" chưa có bộ chọn khoảng tuỳ ý → như "Toàn bộ" (cùng hành vi DS hoá đơn).
  const dateRange = useMemo(() => dateRangeToISO(datePreset), [datePreset]);
  const debouncedFilters = useDebounce(filters);

  const searchBody = useMemo<SearchSalesOrdersBody>(() => {
    const columnFilters = buildColumnFilters(debouncedFilters, filterOperators);
    return {
      view: "DELIVERY",
      deliveryTab: tab || undefined,
      dateField,
      from: dateRange.from,
      to: dateRange.to,
      stockShort: filters.label === ORDER_STOCK_SHORT_LABEL ? true : undefined,
      columnFilters:
        Object.keys(columnFilters).length > 0 ? columnFilters : undefined,
      page,
      limit: ORDER_LIST_PAGE_SIZE,
    };
  }, [
    tab,
    dateField,
    dateRange,
    filters.label,
    debouncedFilters,
    filterOperators,
    page,
  ]);

  const query = useSearchSalesOrdersQuery(searchBody);

  // view DELIVERY → server trả `BranchDeliveryOrderRow` cho mọi dòng.
  const rows = useMemo(
    () => (query.data?.data ?? []) as DeliveryOrderRow[],
    [query.data],
  );
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ORDER_LIST_PAGE_SIZE));

  /** Đổi bộ lọc: về trang 1 và bỏ chọn dòng. */
  const resetView = useCallback(() => {
    setPageState(1);
    setSelectedIds(new Set());
  }, []);

  const setTab = useCallback(
    (next: OrderTab) => {
      setTabState(next);
      resetView();
    },
    [resetView],
  );

  const setDateField = useCallback(
    (next: OrderDateField) => {
      setDateFieldState(next);
      resetView();
    },
    [resetView],
  );

  const setDatePreset = useCallback(
    (next: PosDateRangeFilterOption) => {
      setDatePresetState(next);
      resetView();
    },
    [resetView],
  );

  const setFilter = useCallback(
    (key: keyof OrderFilters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      resetView();
    },
    [resetView],
  );

  const setFilterOperator = useCallback(
    (key: OrderOperatorKey, op: FilterOperatorEnum) => {
      setFilterOperators((prev) => ({ ...prev, [key]: op }));
      resetView();
    },
    [resetView],
  );

  const setPage = useCallback((next: number) => {
    setPageState(next);
    setSelectedIds(new Set());
  }, []);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllRows = useCallback(() => {
    setSelectedIds((prev) =>
      rows.length > 0 && rows.every((r) => prev.has(r.id))
        ? new Set()
        : new Set(rows.map((r) => r.id)),
    );
  }, [rows]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  return {
    tab,
    setTab,
    dateField,
    setDateField,
    datePreset,
    setDatePreset,
    filters,
    setFilter,
    filterOperators,
    setFilterOperator,
    rows,
    isLoading: query.isLoading,
    page: Math.min(page, totalPages),
    pageSize: ORDER_LIST_PAGE_SIZE,
    total,
    totalPages,
    setPage,
    refetch: useCallback(() => void query.refetch(), [query]),
    selectedIds,
    selectedRows,
    toggleRow,
    toggleAllRows,
    clearSelection,
  };
}

/**
 * Bấm dòng có hoá đơn nháp (A-05) → nạp hoá đơn đó vào một tab checkout mới
 * rồi về `/`. Đi đúng đường restore của "HĐ lưu tạm" (`PosLayout`
 * → `openDraftInNewSession`): tab mang `sourceInvoiceId`, nên lưu/thanh toán
 * ghi đè chính hoá đơn nháp qua `PATCH /invoices/:id`. Dòng lưới không có
 * dòng hàng → lấy chi tiết qua `GET /invoices/:id` (luôn lấy mới, không dùng
 * cache cũ). Dòng không phải nháp: bỏ qua.
 */
export function useOpenDraftInvoice(): (row: DeliveryOrderRow) => void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openDraftInNewSession = usePosCheckoutSessionStore(
    (s) => s.openDraftInNewSession,
  );
  const announce = usePosCheckoutUiStore((s) => s.setAnnouncement);
  const [invoiceId, setInvoiceId] = useState<string>();
  const invoiceQuery = useInvoiceDetailQuery(invoiceId);

  useEffect(() => {
    if (!invoiceId || invoiceQuery.isFetching) return;
    if (invoiceQuery.isError) {
      setInvoiceId(undefined);
      toast.error("Không mở được hoá đơn nháp.");
      return;
    }
    const invoice = invoiceQuery.data;
    if (!invoice) return;
    setInvoiceId(undefined);
    if (invoice.status !== "draft") {
      toast.error("Hoá đơn không còn ở trạng thái nháp.");
      return;
    }
    const draft = mapInvoiceRowToDraftInvoice(invoice, invoice.customer ?? null);
    openDraftInNewSession(draft);
    announce(`Đã tạo hóa đơn mới từ lưu tạm ${draft.invoiceNumber}.`);
    navigate("/");
  }, [
    invoiceId,
    invoiceQuery.isFetching,
    invoiceQuery.isError,
    invoiceQuery.data,
    openDraftInNewSession,
    announce,
    navigate,
  ]);

  return useCallback(
    (row: DeliveryOrderRow) => {
      if (!row.invoiceIsDraft || !row.invoiceId || invoiceId) return;
      // Đánh dấu cũ để observer mới luôn fetch lại — draft có thể vừa bị sửa.
      void queryClient.invalidateQueries({
        queryKey: INVOICE_KEYS.DETAIL(row.invoiceId),
        refetchType: "none",
      });
      setInvoiceId(row.invoiceId);
    },
    [invoiceId, queryClient],
  );
}
