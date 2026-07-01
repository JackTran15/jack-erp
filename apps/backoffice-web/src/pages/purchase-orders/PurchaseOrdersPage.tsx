import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DocumentListShell,
  formatMoneyInteger,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import {
  Barcode,
  Copy,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import {
  InventoryPageTitle,
  InventoryTabBar,
} from "../../components/document/inventoryTabs";
import { useDocumentListSelection } from "../../components/document/useDocumentListSelection";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  buildV2Body,
  type V2SearchConfig,
} from "../../components/crud/crudV2Search";
import { getActiveBranchId } from "../../components/document/goods-receipt-shared";
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderLine,
  PaginatedResponse,
  InventoryProvider,
  InventoryStorage,
} from "../../components/document/goods-receipt-shared";
import { PurchaseOrderFormDialog } from "../../components/document/GoodsReceiptFormDialog";

// MISA collapse labels: DRAFT = "Chưa thực hiện", POSTED = "Đã thực hiện" (xanh),
// CANCELLED/REVERSED = "Đã hủy".
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Chưa thực hiện",
  POSTED: "Đã thực hiện",
  CANCELLED: "Đã hủy",
  REVERSED: "Đã hủy",
};

/** Filter keys align 1:1 with the `GoodsReceiptSearchV2Dto` body fields. */
const FILTER_KEYS = [
  "date",
  "documentNumber",
  "party",
  "totalAmount",
  "description",
  "reason",
  "purpose",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

const GR_SEARCH: V2SearchConfig = {
  path: "/v2/goods-receipts/search",
  fields: {
    documentNumber: "string",
    party: "string",
    description: "string",
    reason: "string",
    purpose: "enum",
    date: "date-range",
    totalAmount: "compare",
  },
};

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<FilterKey, ColumnFilter>,
  );
}

function lineSubtotal(l: {
  quantity: number | string;
  unitPrice: number | string;
  lineTotal?: number | string;
}): number {
  if (l.lineTotal !== undefined && l.lineTotal !== null && l.lineTotal !== "")
    return Number(l.lineTotal);
  return Number(l.quantity) * Number(l.unitPrice);
}

function orderTotal(o: PurchaseOrder): number {
  return o.lines.reduce((s, l) => s + lineSubtotal(l), 0);
}

function purchasePurposeLabel(purpose: PurchaseOrder["purpose"]): string {
  if (purpose === "PURCHASE") return "Phiếu nhập hàng - Ghi nợ nhà cung cấp";
  if (purpose === "TRANSFER_IN") return "Phiếu nhập kho điều chuyển";
  if (purpose === "STOCK_TAKE") return "Phiếu nhập kho kiểm kê";
  return "Phiếu nhập kho khác";
}

function renderStatusBadge(status: PurchaseOrderStatus) {
  const isCancelled = status === "CANCELLED" || status === "REVERSED";
  const className =
    status === "POSTED"
      ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
      : isCancelled
        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
        : "bg-muted text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

type PurchaseOrdersPageMode = "inventory" | "purchase";

export function PurchaseOrdersPage({
  mode = "inventory",
}: {
  mode?: PurchaseOrdersPageMode;
}) {
  const isPurchaseMode = mode === "purchase";
  const location = useLocation();
  const navigate = useNavigate();
  const [records, setRecords] =
    useState<PaginatedResponse<PurchaseOrder> | null>(null);
  const [providers, setProviders] = useState<InventoryProvider[]>([]);
  const [storages, setStorages] = useState<InventoryStorage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] =
    useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [dialogMode, setDialogMode] = useState<
    "create" | "edit" | "view" | null
  >(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PurchaseOrder | null>(
    null,
  );
  const [confirmVoid, setConfirmVoid] = useState<PurchaseOrder | null>(null);
  const [autoOpenTransferPicker, setAutoOpenTransferPicker] = useState(false);
  const [autoSelectTransferOrder, setAutoSelectTransferOrder] = useState<{
    id: string;
    sourceBranchName?: string | null;
    exportGoodsIssueId?: string | null;
    exportGoodsIssueDocumentNumber?: string | null;
  } | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const searchFilters: Record<FilterKey, ColumnFilter> = {
        ...columnFilters,
        date: {
          ...columnFilters.date,
          from: period.from,
          to: period.to,
        },
      };
      const body = buildV2Body(
        GR_SEARCH,
        searchFilters as unknown as Record<string, ColumnFilter>,
        pagination.page,
        pagination.pageSize,
      );
      if (isPurchaseMode) {
        body.purposes = ["PURCHASE"];
      } else {
        body.excludePurposes = ["PURCHASE"];
      }
      const { data } = await apiClient.post<{
        data: PurchaseOrder[];
        total: number;
        page: number;
        limit: number;
      }>("/v2/goods-receipts/search", body);
      setRecords({
        data: data.data,
        total: data.total,
        page: data.page,
        pageSize: data.limit,
      });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({
        data: [],
        total: 0,
        page: 1,
        pageSize: pagination.pageSize,
      });
    } finally {
      setLoading(false);
    }
  }, [pagination, columnFilters, period, isPurchaseMode]);

  const loadProviders = useCallback(async () => {
    try {
      const { data } = await apiClient.get<
        PaginatedResponse<InventoryProvider>
      >("/inventory/providers?page=1&pageSize=200");
      setProviders(data.data);
    } catch {
      // best-effort; row will fall back to id if name is missing
    }
  }, []);

  const loadStorages = useCallback(async () => {
    try {
      // Scope warehouses to the active branch (same id the axios client sends as
      // X-Branch-Id) so the kho dropdown only lists this branch's warehouses.
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      const branchId = getActiveBranchId();
      if (branchId) params.set("branchId", branchId);
      const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
        `/inventory/storages?${params}`,
      );
      setStorages(data.data);
    } catch {
      // best-effort — Storage names will fall back to id in detail panel
    }
  }, []);

  useEffect(() => {
    // Debounce so rapid filter typing settles into a single request.
    const t = setTimeout(() => void loadRecords(), 300);
    return () => clearTimeout(t);
  }, [loadRecords]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  useEffect(() => {
    const state = location.state as {
      openDocumentId?: string;
      openTransferInPicker?: boolean;
      transferOrderId?: string;
      sourceBranchName?: string | null;
      exportGoodsIssueId?: string | null;
      exportGoodsIssueDocumentNumber?: string | null;
    } | null;
    if (state?.openTransferInPicker) {
      setEditingOrder(null);
      setDialogMode("create");
      setAutoOpenTransferPicker(true);
      setAutoSelectTransferOrder(
        state.transferOrderId
          ? {
              id: state.transferOrderId,
              sourceBranchName: state.sourceBranchName,
              exportGoodsIssueId: state.exportGoodsIssueId,
              exportGoodsIssueDocumentNumber:
                state.exportGoodsIssueDocumentNumber,
            }
          : null,
      );
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    const openDocumentId = state?.openDocumentId;
    if (!openDocumentId) return;
    void (async () => {
      try {
        const { data } = await apiClient.get<PurchaseOrder>(
          `/goods-receipts/${openDocumentId}`,
        );
        setSelectedId(data.id);
        setEditingOrder(data);
        setDialogMode("view");
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      } finally {
        navigate(location.pathname, { replace: true, state: null });
      }
    })();
  }, [location.pathname, location.state, navigate]);

  const storageNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of storages) map.set(s.id, s.name);
    return map;
  }, [storages]);

  const providerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of providers) map.set(p.id, p.name);
    for (const order of records?.data ?? []) {
      if (order.providerName && order.providerId)
        map.set(order.providerId, order.providerName);
    }
    return map;
  }, [providers, records]);

  const getOrderId = useCallback((order: PurchaseOrder) => order.id, []);
  const {
    selectedId,
    setSelectedId,
    activeRecord: selectedOrder,
  } = useDocumentListSelection({
    rows: records?.data ?? [],
    getRowId: getOrderId,
  });

  // ─── Row actions ──────────────────────────────────────────────────────────────

  const reloadAfterMutation = useCallback(async () => {
    await loadRecords();
  }, [loadRecords]);

  // Void/reverse a receipt ("Hoãn"). Calls the cancel endpoint, which reverses
  // the stock ledger when the doc was POSTED before marking it cancelled.
  const handleVoid = async (order: PurchaseOrder) => {
    setActionLoading(order.id);
    setConfirmVoid(null);
    try {
      await apiClient.delete(`/goods-receipts/${order.id}`);
      setDialogMode(null);
      setEditingOrder(null);
      if (selectedId === order.id) setSelectedId(null);
      await reloadAfterMutation();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (order: PurchaseOrder) => {
    setActionLoading(order.id);
    setConfirmDelete(null);
    try {
      await apiClient.delete(`/goods-receipts/${order.id}`);
      if (selectedId === order.id) setSelectedId(null);
      await reloadAfterMutation();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Toolbar config ───────────────────────────────────────────────────────────

  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Thêm mới",
      icon: Plus,
      onClick: () => {
        setEditingOrder(null);
        setDialogMode("create");
      },
    },
    {
      id: "duplicate",
      label: "Nhân bản",
      icon: Copy,
      disabled: !selectedOrder,
      onClick: () => {
        if (!selectedOrder) return;
        setEditingOrder(selectedOrder);
        setDialogMode("create");
      },
    },
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selectedOrder,
      onClick: () => {
        if (!selectedOrder) return;
        setEditingOrder(selectedOrder);
        setDialogMode("view");
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !selectedOrder || selectedOrder.status !== "DRAFT",
      onClick: () => {
        if (!selectedOrder) return;
        setEditingOrder(selectedOrder);
        setDialogMode("edit");
      },
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      // Allow deleting any non-terminal row. BE cancel() handles POSTED by
      // reversing the stock movements before soft-deleting.
      disabled:
        !selectedOrder ||
        selectedOrder.status === "CANCELLED" ||
        selectedOrder.status === "REVERSED",
      onClick: () => selectedOrder && setConfirmDelete(selectedOrder),
    },
    { id: "sep1", type: "separator" },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => void loadRecords(),
    },
    {
      id: "barcode",
      label: "In tem mã",
      icon: Barcode,
      disabled: !selectedOrder,
      onClick: () => toast.info("Tính năng in tem mã sẽ được bổ sung."),
    },
  ];

  // ─── Master table columns ─────────────────────────────────────────────────────

  const totalSum = useMemo(
    () => (records?.data ?? []).reduce((s, r) => s + orderTotal(r), 0),
    [records],
  );
  const showTotalFooter = !loading && (records?.data.length ?? 0) > 0;

  const columns: TableColumn<PurchaseOrder>[] = [
    {
      key: "date",
      label: isPurchaseMode ? "Ngày nhập" : "Ngày",
      width: 150,
      filterKind: "date-range",
      render: (row) =>
        row.receivedAt
          ? new Date(row.receivedAt).toLocaleDateString("vi-VN")
          : new Date(row.createdAt).toLocaleDateString("vi-VN"),
    },
    {
      key: "documentNumber",
      label: "Số phiếu nhập",
      width: 140,
      render: (row) => (
        <button
          type="button"
          className="text-primary-blue transition-colors hover:text-primary-blue-hover hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(row.id);
            setEditingOrder(row);
            setDialogMode("view");
          }}
          title={row.documentNumber ?? row.id}
        >
          {/* Receipts created before the BE switch may still have null docNumber;
              fall back to a short id slice so the row stays clickable. */}
          {row.documentNumber ?? `#${row.id.slice(0, 8)}`}
        </button>
      ),
    },
    {
      key: "party",
      label: isPurchaseMode ? "Nhà cung cấp" : "Đối tượng",
      width: 180,
      render: (row) =>
        row.counterparty?.name ??
        row.provider?.name ??
        (row.providerId
          ? (providerNameById.get(row.providerId) ?? row.providerId)
          : "—"),
    },
    {
      key: "totalAmount",
      label: isPurchaseMode ? "Thành tiền" : "Tổng tiền",
      width: 140,
      filterKind: "number-range",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      footer: showTotalFooter ? formatMoneyInteger(totalSum) : undefined,
      render: (row) => formatMoneyInteger(orderTotal(row)),
    },
    ...(isPurchaseMode
      ? ([
          {
            key: "buyer",
            label: "NV mua hàng",
            width: 160,
            render: (row: PurchaseOrder) => row.deliveredBy ?? "",
          },
        ] satisfies TableColumn<PurchaseOrder>[])
      : []),
    {
      key: "description",
      label: "Diễn giải",
      render: (row) => row.description ?? "",
    },
    ...(isPurchaseMode
      ? []
      : ([
          {
            key: "reason",
            label: "Lý do",
            width: 160,
            render: (row: PurchaseOrder) => row.reason ?? "",
          },
          {
            key: "purpose",
            label: "Loại chứng từ",
            width: 200,
            filterKind: "select",
            filterPlaceholder: "Tất cả",
            filterOptions: [
              { value: "OTHER", label: "Phiếu nhập kho khác" },
              {
                value: "TRANSFER_IN",
                label: "Phiếu nhập kho điều chuyển",
              },
              { value: "STOCK_TAKE", label: "Phiếu nhập kho kiểm kê" },
            ],
            render: (row: PurchaseOrder) => purchasePurposeLabel(row.purpose),
          },
        ] satisfies TableColumn<PurchaseOrder>[])),
    {
      key: "status",
      label: "Trạng thái",
      width: 130,
      render: (row) => renderStatusBadge(row.status),
    },
  ];

  // Any filter edit resets to page 1 so the server result starts from the top.
  const resetPage = useCallback(
    () =>
      setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 })),
    [],
  );

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], mode },
        }));
        resetPage();
      },
      onValueChange: (key: string, value: string) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], value },
        }));
        resetPage();
      },
      onRangeChange: (key: string, part: "from" | "to", value: string) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], [part]: value },
        }));
        resetPage();
      },
    }),
    [columnFilters, resetPage],
  );

  /** Preview the next document number based on max numeric suffix in current list.
   *  Format: NK + 6-digit zero-padded. Empty list → NK000001. */
  const nextDocumentNumber = useMemo(() => {
    const rows = records?.data ?? [];
    let max = 0;
    for (const row of rows) {
      const m = row.documentNumber?.match(/(\d+)$/);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return `NK${String(max + 1).padStart(6, "0")}`;
  }, [records]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <DocumentListShell
        title={
          isPurchaseMode ? (
            "Nhập hàng"
          ) : (
            <InventoryPageTitle>Nhập kho</InventoryPageTitle>
          )
        }
        tabs={
          isPurchaseMode ? undefined : (
            <InventoryTabBar activeId="purchase-orders" />
          )
        }
        toolbar={
          <PageToolbar
            items={toolbarItems}
            tone="primary"
            className="m-2 rounded-md"
          />
        }
        filters={
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            onApply={() => void loadRecords()}
          />
        }
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={records?.total ?? 0}
            onPageChange={(p) =>
              setPagination((prev) => ({ ...prev, page: p }))
            }
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({
                ...prev,
                page: 1,
                pageSize: nextPageSize,
              }))
            }
          />
        }
        detailPanel={
          <DetailPanel
            order={selectedOrder}
            storageNameById={storageNameById}
            isPurchaseMode={isPurchaseMode}
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={records?.data ?? []}
          loading={loading}
          emptyLabel={
            isPurchaseMode
              ? "Chưa có phiếu nhập hàng."
              : "Chưa có phiếu nhập kho."
          }
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (row) => (
              <input
                type="checkbox"
                aria-label="Chọn dòng"
                checked={selectedId === row.id}
                onChange={() =>
                  setSelectedId(selectedId === row.id ? null : row.id)
                }
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
          columnFilterControl={columnFilterControl}
        />
      </DocumentListShell>

      {dialogMode && (
        <PurchaseOrderFormDialog
          mode={dialogMode}
          initial={editingOrder}
          providers={providers}
          storages={storages}
          actionLoading={!!actionLoading}
          previewDocumentNumber={nextDocumentNumber}
          onClose={() => {
            setDialogMode(null);
            setEditingOrder(null);
            setAutoOpenTransferPicker(false);
            setAutoSelectTransferOrder(null);
          }}
          onSaved={async () => {
            setDialogMode(null);
            setEditingOrder(null);
            setAutoOpenTransferPicker(false);
            setAutoSelectTransferOrder(null);
            await loadRecords();
          }}
          onEdit={() => setDialogMode("edit")}
          onVoid={editingOrder ? () => setConfirmVoid(editingOrder) : undefined}
          onRequestDelete={
            editingOrder ? () => setConfirmDelete(editingOrder) : undefined
          }
          autoOpenTransferPicker={autoOpenTransferPicker}
          autoSelectTransferOrder={autoSelectTransferOrder}
          documentKind={
            isPurchaseMode ? "purchase-import" : "warehouse-receipt"
          }
        />
      )}

      {confirmDelete && (
        <ConfirmActionModal
          title="Xóa phiếu nhập kho"
          message={`Xác nhận xóa phiếu ${confirmDelete.documentNumber ?? confirmDelete.id}? Thao tác này không thể hoàn tác.`}
          confirmLabel="Xóa phiếu"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDelete(confirmDelete)}
        />
      )}

      {confirmVoid && (
        <ConfirmActionModal
          title="Hoãn phiếu nhập kho"
          message={
            confirmVoid.status === "POSTED"
              ? `Hoãn phiếu ${confirmVoid.documentNumber ?? confirmVoid.id}? Thao tác này sẽ đảo bút tồn kho đã ghi và không thể hoàn tác.`
              : `Hoãn phiếu ${confirmVoid.documentNumber ?? confirmVoid.id}? Thao tác này không thể hoàn tác.`
          }
          confirmLabel="Hoãn phiếu"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmVoid.id}
          onCancel={() => setConfirmVoid(null)}
          onConfirm={() => void handleVoid(confirmVoid)}
        />
      )}
    </>
  );
}

// ─── Detail panel (selected order's lines) ───────────────────────────────────

function DetailPanel({
  order,
  storageNameById,
  isPurchaseMode,
}: {
  order: PurchaseOrder | null;
  storageNameById: Map<string, string>;
  isPurchaseMode: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 inline-block border-b-2 border-primary px-2 pb-1 text-sm font-semibold">
        Chi tiết
      </div>
      {!order ? (
        <p className="text-sm text-muted-foreground">
          Chọn một phiếu để xem chi tiết.
        </p>
      ) : order.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Phiếu này chưa có dòng hàng.
        </p>
      ) : (
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Mã SKU
              </th>
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Tên hàng hóa
              </th>
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Kho
              </th>
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Vị trí
              </th>
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Đơn vị tính
              </th>
              <th className="border-r px-2 py-1.5 text-right font-medium">
                {isPurchaseMode ? "Số lượng" : "SL theo chứng từ"}
              </th>
              {isPurchaseMode ? null : (
                <th className="border-r px-2 py-1.5 text-right font-medium">
                  SL thực tế
                </th>
              )}
              <th className="border-r px-2 py-1.5 text-right font-medium">
                Đơn giá
              </th>
              <th className="border-r px-2 py-1.5 text-right font-medium">
                Thành tiền
              </th>
              {isPurchaseMode ? (
                <>
                  <th className="border-r px-2 py-1.5 text-right font-medium">
                    % CK
                  </th>
                  <th className="border-r px-2 py-1.5 text-right font-medium">
                    Tiền CK
                  </th>
                  <th className="border-r px-2 py-1.5 text-right font-medium">
                    Thuế suất
                  </th>
                  <th className="border-r px-2 py-1.5 text-right font-medium">
                    Tiền thuế
                  </th>
                  <th className="border-r px-2 py-1.5 text-right font-medium">
                    Tiền thanh toán
                  </th>
                </>
              ) : null}
              <th className="px-2 py-1.5 text-left font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((rawLine) => {
              const line = rawLine as PurchaseOrderLine;
              const itemCode =
                line.item?.code ?? line.itemCode ?? line.itemId.slice(0, 8);
              const itemName = line.item?.name ?? line.itemName ?? "—";
              const storageId =
                line.location?.storageId ?? order.location?.storageId;
              const storageName = storageId
                ? (storageNameById.get(storageId) ?? storageId.slice(0, 8))
                : "—";
              const binCode = line.location?.code ?? line.location?.name ?? "—";
              const unitLabel =
                line.item?.unit ?? line.unit ?? line.uomCode ?? "—";
              return (
                <tr key={line.id} className="border-b">
                  <td className="border-r px-2 py-1 font-mono text-xs">
                    {itemCode}
                  </td>
                  <td className="border-r px-2 py-1">{itemName}</td>
                  <td className="border-r px-2 py-1">{storageName}</td>
                  <td className="border-r px-2 py-1 font-mono text-xs">
                    {binCode}
                  </td>
                  <td className="border-r px-2 py-1">{unitLabel}</td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {Number(line.quantity)}
                  </td>
                  {isPurchaseMode ? null : (
                    <td className="border-r px-2 py-1 text-right tabular-nums">
                      {Number(line.quantity)}
                    </td>
                  )}
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {formatMoneyInteger(Number(line.unitPrice))}
                  </td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {formatMoneyInteger(lineSubtotal(line))}
                  </td>
                  {isPurchaseMode ? (
                    <>
                      <td className="border-r px-2 py-1 text-right tabular-nums">
                        0
                      </td>
                      <td className="border-r px-2 py-1 text-right tabular-nums">
                        0
                      </td>
                      <td className="border-r px-2 py-1 text-right tabular-nums" />
                      <td className="border-r px-2 py-1 text-right tabular-nums">
                        0
                      </td>
                      <td className="border-r px-2 py-1 text-right tabular-nums">
                        {formatMoneyInteger(lineSubtotal(line))}
                      </td>
                    </>
                  ) : null}
                  <td className="px-2 py-1">{line.note ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
