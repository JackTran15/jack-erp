import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { showBatchResultToast } from "@erp/pos/components/page-components/OrderList/BatchResultToast";
import { useDebounce } from "@erp/pos/hooks/common/use-debounce";
import {
  useProcessSalesOrdersMutation,
  useSalesChannelsQuery,
  useSearchSalesOrdersQuery,
} from "@erp/pos/hooks/react-query/use-query-sales-order";
import { useCurrentUserQuery } from "@erp/pos/hooks/react-query/use-query-user";
import {
  dateRangeToISO,
  type PosDateRangeFilterOption,
} from "@erp/pos/lib/common/dateRangeFilter";
import { FilterOperatorEnum } from "@erp/pos/constants/checkout.constant";
import {
  EMPTY_ONLINE_ORDER_FILTERS,
  ONLINE_ORDER_DEFAULT_STATUS,
  ONLINE_ORDER_LIST_DEFAULT_PAGE_SIZE,
  ONLINE_ORDER_STOCK_SHORT_LABEL,
  type OnlineOrderStatusFilter,
} from "@erp/pos/constants/online-order-list.constant";
import type {
  CompareFilter,
  DateRangeFilter,
  StringFilter,
} from "@erp/pos/dtos/invoice.dto";
import type {
  SalesOrderColumnFilters,
  SearchSalesOrdersBody,
} from "@erp/pos/dtos/sales-order.dto";
import type {
  SalesChannelRow,
  SalesOrderRow,
} from "@erp/pos/interfaces/sales-order.interface";

export type OnlineOrderFilters = {
  -readonly [K in keyof typeof EMPTY_ONLINE_ORDER_FILTERS]: string;
};

/** Ô lọc có bộ chọn toán tử (text / số / ngày). `label` là select, không có. */
export type OnlineOrderOperatorKey = Exclude<keyof OnlineOrderFilters, "label">;

export type OnlineOrderFilterOperators = Record<
  OnlineOrderOperatorKey,
  FilterOperatorEnum
>;

/**
 * Quyền backend chặn ở `POST /mobile/sales-orders/process`. Gate UI theo khoá
 * quyền, không theo tên vai trò (xem `invoice-cancel.constant.ts`).
 */
const SALES_ORDER_APPROVE_PERMISSION = "pos.sales-order.approve";

/** Lỗi cả request (mạng / 403 / 5xx) — `http` ném `Error("HTTP <status>: <body>")`. */
function processRequestErrorMessage(err: Error): string {
  const match = /^HTTP (\d+): ([\s\S]*)$/.exec(err.message);
  if (!match) return err.message || "Nhận xử lý thất bại. Vui lòng thử lại.";
  if (match[1] === "403") return "Bạn không có quyền nhận xử lý đơn hàng.";
  try {
    const body = JSON.parse(match[2]) as { message?: unknown };
    if (typeof body.message === "string" && body.message) return body.message;
  } catch {
    // body không phải JSON — rơi xuống thông điệp chung.
  }
  return "Nhận xử lý thất bại. Vui lòng thử lại.";
}

const DEFAULT_OPERATORS: OnlineOrderFilterOperators = {
  externalOrderId: FilterOperatorEnum.CONTAINS,
  orderDate: FilterOperatorEnum.LESS_THAN_OR_EQUAL,
  deliveryInfo: FilterOperatorEnum.CONTAINS,
  amountDue: FilterOperatorEnum.LESS_THAN_OR_EQUAL,
  deliveryPartnerName: FilterOperatorEnum.CONTAINS,
  salespersonName: FilterOperatorEnum.CONTAINS,
  invoiceCode: FilterOperatorEnum.CONTAINS,
  note: FilterOperatorEnum.CONTAINS,
};

// ─── Operator mappings (giống use-invoice-list) ─────────────────────────────

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

const TEXT_KEYS = [
  "externalOrderId",
  "deliveryInfo",
  "deliveryPartnerName",
  "salespersonName",
  "invoiceCode",
  "note",
] as const;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "dd/mm/yyyy" (hoặc "yyyy-mm-dd") → "YYYY-MM-DD"; sai định dạng → null. */
function parseViDate(raw: string): string | null {
  const s = raw.trim();
  const vi = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const [y, m, d] = vi
    ? [Number(vi[3]), Number(vi[2]), Number(vi[1])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [0, 0, 0];
  if (!y) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function shiftDay(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Ô "Ngày đơn hàng" → `DateRangeFilter`. Server hiểu `YYYY-MM-DD` là trọn
 * một ngày giờ VN, nên `≤ d` = `to: d`, `< d` = `to: d-1`, `= d` = cả ngày d.
 */
function dateColumnFilter(
  raw: string,
  op: FilterOperatorEnum,
): DateRangeFilter | undefined {
  const day = parseViDate(raw);
  if (!day) return undefined;
  switch (op) {
    case FilterOperatorEnum.LESS_THAN_OR_EQUAL:
      return { to: day };
    case FilterOperatorEnum.LESS_THAN:
      return { to: shiftDay(day, -1) };
    case FilterOperatorEnum.GREATER_THAN_OR_EQUAL:
      return { from: day };
    case FilterOperatorEnum.GREATER_THAN:
      return { from: shiftDay(day, 1) };
    default:
      return { from: day, to: day };
  }
}

// ─── Hook interface ──────────────────────────────────────────────────────────

export interface UseOnlineOrderListResult {
  channels: ReadonlyArray<SalesChannelRow>;
  channelsLoading: boolean;
  selectedChannelId: string | null;
  selectChannel: (id: string) => void;
  datePreset: PosDateRangeFilterOption;
  setDatePreset: (next: PosDateRangeFilterOption) => void;
  /** `YYYY-MM-DD` khi khoảng đang lọc là đúng một ngày; ngược lại "". */
  selectedDate: string;
  setSelectedDate: (isoDate: string) => void;
  status: OnlineOrderStatusFilter;
  setStatus: (next: OnlineOrderStatusFilter) => void;
  filters: OnlineOrderFilters;
  setFilter: (key: keyof OnlineOrderFilters, value: string) => void;
  filterOperators: OnlineOrderFilterOperators;
  setFilterOperator: (key: OnlineOrderOperatorKey, op: FilterOperatorEnum) => void;
  rows: ReadonlyArray<SalesOrderRow>;
  isLoading: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (next: number) => void;
  setPageSize: (next: number) => void;
  refetch: () => void;
  /** Ô tick — nguồn cho "Nhận xử lý". */
  selectedIds: ReadonlySet<string>;
  selectedRows: ReadonlyArray<SalesOrderRow>;
  toggleRow: (id: string) => void;
  toggleAllRows: () => void;
  clearSelection: () => void;
  /** Có quyền `pos.sales-order.approve` — thiếu thì ẩn nút "Nhận xử lý". */
  canProcess: boolean;
  /** Bật khi có ≥1 đơn tick và mọi đơn tick đều "Chưa xử lý" (SENT) — AC-09. */
  processEnabled: boolean;
  /** *Nhận xử lý* các đơn đang tick; kết quả báo bằng toast. */
  processSelected: () => void;
}

/**
 * State cho trang `/online-orders`: kênh (sidebar) + ngày + trạng thái + lọc
 * cột → `POST /v2/mobile/sales-orders/search` (view ONLINE). Lọc và phân trang
 * chạy server-side; ô lọc gõ tay được debounce 300 ms. Mọi thay đổi bộ lọc /
 * trang đưa về trang 1 và bỏ chọn các dòng đã tick.
 */
export function useOnlineOrderList(): UseOnlineOrderListResult {
  const channelsQuery = useSalesChannelsQuery();
  const channels = channelsQuery.data ?? [];

  const [channelId, setChannelId] = useState<string | null>(null);
  const [datePreset, setDatePresetState] =
    useState<PosDateRangeFilterOption>("TODAY");
  const [customDate, setCustomDate] = useState("");
  const [status, setStatusState] = useState<OnlineOrderStatusFilter>(
    ONLINE_ORDER_DEFAULT_STATUS,
  );
  const [filters, setFilters] = useState<OnlineOrderFilters>(() => ({
    ...EMPTY_ONLINE_ORDER_FILTERS,
  }));
  const [filterOperators, setFilterOperators] =
    useState<OnlineOrderFilterOperators>(() => ({ ...DEFAULT_OPERATORS }));
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(
    ONLINE_ORDER_LIST_DEFAULT_PAGE_SIZE,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Kênh đầu tiên được chọn sẵn (AC-01); kênh đã chọn mà biến mất → về kênh đầu.
  const selectedChannelId =
    channels.find((c) => c.id === channelId)?.id ?? channels[0]?.id ?? null;

  const dateRange = useMemo(
    () =>
      datePreset === "OTHER"
        ? customDate
          ? { from: customDate, to: customDate }
          : {}
        : dateRangeToISO(datePreset),
    [datePreset, customDate],
  );
  const selectedDate =
    dateRange.from && dateRange.from === dateRange.to ? dateRange.from : "";

  const debouncedFilters = useDebounce(filters);

  const searchBody = useMemo<SearchSalesOrdersBody>(() => {
    const columnFilters: SalesOrderColumnFilters = {};
    for (const key of TEXT_KEYS) {
      const value = debouncedFilters[key].trim();
      if (value) {
        columnFilters[key] = {
          operator: TEXT_OP_MAP[filterOperators[key]],
          value,
        };
      }
    }
    const orderDate = dateColumnFilter(
      debouncedFilters.orderDate,
      filterOperators.orderDate,
    );
    if (orderDate) columnFilters.orderDate = orderDate;

    const rawAmount = debouncedFilters.amountDue.trim();
    const amount = rawAmount
      ? parseFloat(rawAmount.replace(/[.,\s]/g, ""))
      : NaN;
    if (Number.isFinite(amount)) {
      columnFilters.amountDue = {
        operator: NUM_OP_MAP[filterOperators.amountDue],
        value: amount,
      };
    }

    return {
      view: "ONLINE",
      channelId: selectedChannelId ?? undefined,
      status: status || undefined,
      dateField: "CREATED",
      from: dateRange.from,
      to: dateRange.to,
      stockShort:
        filters.label === ONLINE_ORDER_STOCK_SHORT_LABEL ? true : undefined,
      columnFilters:
        Object.keys(columnFilters).length > 0 ? columnFilters : undefined,
      page,
      limit: pageSize,
    };
  }, [
    selectedChannelId,
    status,
    dateRange,
    filters.label,
    debouncedFilters,
    filterOperators,
    page,
    pageSize,
  ]);

  const query = useSearchSalesOrdersQuery(searchBody, {
    enabled: selectedChannelId !== null,
  });

  const rows = useMemo(
    () => (selectedChannelId ? (query.data?.data ?? []) : []),
    [selectedChannelId, query.data],
  );
  const total = selectedChannelId ? (query.data?.total ?? 0) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /** Đổi bộ lọc / trang: về trang 1 (nếu cần) và bỏ chọn dòng. */
  const resetView = useCallback(() => {
    setPageState(1);
    setSelectedIds(new Set());
  }, []);

  const selectChannel = useCallback(
    (id: string) => {
      setChannelId(id);
      resetView();
    },
    [resetView],
  );

  const setDatePreset = useCallback(
    (next: PosDateRangeFilterOption) => {
      // "Khác" mà chưa có ngày → giữ ngày đang lọc để lưới không nhảy sang "Toàn bộ".
      if (next === "OTHER" && !customDate) {
        setCustomDate(dateRange.from ?? dateRangeToISO("TODAY").from ?? "");
      }
      setDatePresetState(next);
      resetView();
    },
    [customDate, dateRange.from, resetView],
  );

  const setSelectedDate = useCallback(
    (isoDate: string) => {
      if (isoDate) {
        setCustomDate(isoDate);
        setDatePresetState("OTHER");
      } else {
        setDatePresetState("ALL");
      }
      resetView();
    },
    [resetView],
  );

  const setStatus = useCallback(
    (next: OnlineOrderStatusFilter) => {
      setStatusState(next);
      resetView();
    },
    [resetView],
  );

  const setFilter = useCallback(
    (key: keyof OnlineOrderFilters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      resetView();
    },
    [resetView],
  );

  const setFilterOperator = useCallback(
    (key: OnlineOrderOperatorKey, op: FilterOperatorEnum) => {
      setFilterOperators((prev) => ({ ...prev, [key]: op }));
      resetView();
    },
    [resetView],
  );

  const setPage = useCallback((next: number) => {
    setPageState(next);
    setSelectedIds(new Set());
  }, []);

  const setPageSize = useCallback(
    (next: number) => {
      setPageSizeState(next);
      resetView();
    },
    [resetView],
  );

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

  const { data: currentUser } = useCurrentUserQuery();
  // Chỉ là lớp ẩn nút — backend mới là chỗ chặn thật.
  const canProcess = (currentUser?.permissions ?? []).includes(
    SALES_ORDER_APPROVE_PERMISSION,
  );
  const processMutation = useProcessSalesOrdersMutation();
  const processEnabled =
    canProcess &&
    !processMutation.isPending &&
    selectedRows.length > 0 &&
    selectedRows.every((r) => r.status === "SENT");

  const processSelected = useCallback(() => {
    if (!processEnabled) return;
    const labels = new Map(
      selectedRows.map((r) => [r.id, r.externalOrderId ?? r.id]),
    );
    processMutation.mutate(
      { ids: selectedRows.map((r) => r.id) },
      {
        onSuccess: ({ results }) =>
          showBatchResultToast({
            results,
            actionLabel: "đã nhận xử lý",
            labelOf: (id) => labels.get(id) ?? id,
          }),
        onError: (err) => toast.error(processRequestErrorMessage(err)),
        // Mutation đã invalidate lưới; bỏ tick để không giữ đơn đã đổi trạng thái.
        onSettled: clearSelection,
      },
    );
  }, [processEnabled, selectedRows, processMutation, clearSelection]);

  return {
    channels,
    channelsLoading: channelsQuery.isLoading,
    selectedChannelId,
    selectChannel,
    datePreset,
    setDatePreset,
    selectedDate,
    setSelectedDate,
    status,
    setStatus,
    filters,
    setFilter,
    filterOperators,
    setFilterOperator,
    rows,
    isLoading: query.isLoading,
    page: Math.min(page, totalPages),
    pageSize,
    total,
    totalPages,
    setPage,
    setPageSize,
    // `refetch` bỏ qua `enabled` — chưa có kênh thì không gọi (body thiếu channelId).
    refetch: useCallback(() => {
      if (selectedChannelId) void query.refetch();
    }, [query, selectedChannelId]),
    selectedIds,
    selectedRows,
    toggleRow,
    toggleAllRows,
    clearSelection,
    canProcess,
    processEnabled,
    processSelected,
  };
}
