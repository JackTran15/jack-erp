import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  DocumentFormDialog,
  DocumentListShell,
  formatMoneyInteger,
  Input,
  LineItemGrid,
  MoneyInput,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type LineColumn,
  type PeriodValue,
  type ToolbarItem,
  UnsavedChangesDialog,
  type UnsavedChangesChoice,
} from "@erp/ui";
import {
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Copy,
  Eye,
  HelpCircle,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { getPreferredShelfBatch } from "../../api/inventory-location-preferences";
import {
  SelectTransferReceiptDialog,
  type TransferReceiptDetail,
} from "./SelectTransferReceiptDialog";
import type { ImportableTransferOrderListItem } from "@erp/shared-interfaces";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { SearchListingInput } from "../../components/forms/SearchListingInput";
import { LookupField } from "../../components/forms/LookupField";
import { CounterpartyPickerField } from "../../components/forms/CounterpartyPickerField";
import {
  QuickCreateItemDialog,
  QuickCreateLocationDialog,
  QuickCreateProviderDialog,
  type QuickItem,
  type QuickLocation,
  type QuickProvider,
} from "../../components/forms/QuickCreateDialogs";
import {
  InventoryPageTitle,
  InventoryTabBar,
} from "../../components/document/inventoryTabs";
import { ChooseWarehouseDialog } from "../../components/document/ChooseWarehouseDialog";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  ensureTrailingBlankLine,
  getPersistableLines,
} from "../inventory-line-normalization";
import {
  buildV2Body,
  type V2SearchConfig,
} from "../../components/crud/crudV2Search";
import { GoodsReceiptImportDialog } from "./import/GoodsReceiptImportDialog";
import type { GoodsReceiptImportJobRow } from "./import/import-goods-receipt.types";
import {
  ProductSelectDialog,
  type ProductSelectResult,
} from "../../components/shared/product-select/ProductSelectDialog";

type GoodsReceiptStatus = "DRAFT" | "POSTED" | "CANCELLED" | "REVERSED";
type GoodsReceiptPurpose = "OTHER" | "TRANSFER_IN" | "STOCK_TAKE";

interface GoodsReceiptLine {
  id: string;
  itemId: string;
  locationId: string;
  binId?: string | null;
  uomCode: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal?: number | string;
  note?: string | null;
  /** Eager-loaded from BE — present on read endpoints. */
  item?: { id: string; code: string; name: string; unit?: string } | null;
  location?: {
    id: string;
    code: string;
    name: string;
    storageId?: string;
  } | null;
}

interface GoodsReceipt {
  id: string;
  documentNumber?: string | null;
  status: GoodsReceiptStatus;
  purpose: GoodsReceiptPurpose;
  providerId?: string | null;
  providerName?: string;
  provider?: { id: string; code: string; name: string } | null;
  counterpartyKind?: "supplier" | "customer" | "employee" | null;
  counterpartyId?: string | null;
  deliveredBy?: string | null;
  reason?: string | null;
  description?: string | null;
  referenceId?: string | null;
  referenceType?: "PURCHASE_ORDER" | "STOCK_TRANSFER" | "STOCK_TAKE" | null;
  references?: string[];
  sourceBranchId?: string | null;
  receivedAt: string;
  locationId: string;
  location?: {
    id: string;
    code: string;
    name: string;
    storageId?: string;
  } | null;
  attachmentIds?: string[];
  lines: GoodsReceiptLine[];
  cashPaymentId?: string | null;
  cashReceiptId?: string | null;
  postedAt?: string | null;
  postedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Aliases for the existing component-internal names to keep diffs small. */
type PurchaseOrderStatus = GoodsReceiptStatus;
type PurchaseOrderLine = GoodsReceiptLine & {
  itemCode?: string;
  itemName?: string;
  warehouse?: string;
  position?: string;
  unit?: string;
};
type PurchaseOrder = GoodsReceipt;

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface InventoryProvider {
  id: string;
  name: string;
  code: string;
}

interface InventoryLocation {
  id: string;
  name: string;
  code: string;
  storageId: string;
  isUnassigned?: boolean;
}

interface InventoryStorage {
  id: string;
  name: string;
  branchId: string;
  isMainStorage?: boolean;
}

/** Active branch — same source the axios client uses for the X-Branch-Id header. */
function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

interface InventoryItem {
  id: string;
  name: string;
  code: string;
  unit: string;
  /** Default purchase price (from item master) — used to auto-fill Đơn giá. */
  purchasePrice?: number | string | null;
}

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

export function PurchaseOrdersPage() {
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<
    "create" | "edit" | "view" | null
  >(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PurchaseOrder | null>(
    null,
  );
  const [confirmVoid, setConfirmVoid] = useState<PurchaseOrder | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const body = buildV2Body(
        GR_SEARCH,
        columnFilters as unknown as Record<string, ColumnFilter>,
        pagination.page,
        pagination.pageSize,
      );
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
  }, [pagination, columnFilters]);

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
    const openDocumentId = (
      location.state as { openDocumentId?: string } | null
    )?.openDocumentId;
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

  const selectedOrder = useMemo(
    () => records?.data.find((o) => o.id === selectedId) ?? null,
    [records, selectedId],
  );

  // ─── Row actions ──────────────────────────────────────────────────────────────

  const reloadAfterMutation = useCallback(async () => {
    await loadRecords();
  }, [loadRecords]);

  // Void/reverse a receipt ("Hoãn"). Calls the cancel endpoint, which reverses
  // the stock ledger when the doc was POSTED before marking it cancelled.
  const handleVoid = async (order: PurchaseOrder) => {
    setActionLoading(order.id);
    try {
      await apiClient.delete(`/goods-receipts/${order.id}`);
      setConfirmVoid(null);
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
    try {
      await apiClient.delete(`/goods-receipts/${order.id}`);
      setConfirmDelete(null);
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
      icon: Tags,
      disabled: !selectedOrder,
      onClick: () => toast.info("Tính năng in tem mã sẽ được bổ sung."),
    },
  ];

  // ─── Master table columns ─────────────────────────────────────────────────────

  const columns: TableColumn<PurchaseOrder>[] = [
    {
      key: "date",
      label: "Ngày",
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
      label: "Đối tượng",
      width: 180,
      render: (row) =>
        row.provider?.name ??
        (row.providerId
          ? (providerNameById.get(row.providerId) ?? row.providerId)
          : "—"),
    },
    {
      key: "totalAmount",
      label: "Tổng tiền",
      width: 140,
      filterKind: "number-range",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => formatMoneyInteger(orderTotal(row)),
    },
    {
      key: "description",
      label: "Diễn giải",
      render: (row) => row.description ?? "",
    },
    {
      key: "reason",
      label: "Lý do",
      width: 160,
      render: (row) => row.reason ?? "",
    },
    {
      key: "purpose",
      label: "Loại chứng từ",
      width: 200,
      filterKind: "select",
      filterOptions: [
        { value: "OTHER", label: "Phiếu nhập kho khác" },
        { value: "TRANSFER_IN", label: "Điều chuyển từ cửa hàng khác" },
      ],
      render: (row) =>
        row.purpose === "TRANSFER_IN"
          ? "Điều chuyển từ cửa hàng khác"
          : row.purpose === "STOCK_TAKE"
            ? "Phiếu nhập kho kiểm kê"
            : "Phiếu nhập kho khác",
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

  const totalSum = useMemo(
    () => (records?.data ?? []).reduce((s, r) => s + orderTotal(r), 0),
    [records],
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
        title={<InventoryPageTitle>Nhập kho</InventoryPageTitle>}
        tabs={<InventoryTabBar activeId="purchase-orders" />}
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
        summary={
          <div className="flex items-center justify-end gap-6 px-2">
            <span className="text-muted-foreground">Tổng tiền:</span>
            <span className="text-base font-semibold">
              {formatMoneyInteger(totalSum)}
            </span>
          </div>
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
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={records?.data ?? []}
          loading={loading}
          emptyLabel="Chưa có phiếu nhập kho."
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
          }}
          onSaved={async () => {
            setDialogMode(null);
            setEditingOrder(null);
            await loadRecords();
          }}
          onEdit={() => setDialogMode("edit")}
          onVoid={editingOrder ? () => setConfirmVoid(editingOrder) : undefined}
          onRequestDelete={
            editingOrder ? () => setConfirmDelete(editingOrder) : undefined
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
}: {
  order: PurchaseOrder | null;
  storageNameById: Map<string, string>;
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
        <table className="w-full border-collapse text-sm">
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
                Số lượng
              </th>
              <th className="border-r px-2 py-1.5 text-right font-medium">
                Đơn giá
              </th>
              <th className="border-r px-2 py-1.5 text-right font-medium">
                Thành tiền
              </th>
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
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {formatMoneyInteger(Number(line.unitPrice))}
                  </td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {formatMoneyInteger(lineSubtotal(line))}
                  </td>
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

// ─── Form dialog (create / edit / view) ──────────────────────────────────────

interface FormLine {
  itemId: string;
  itemLabel: string;
  itemName: string;
  unit: string;
  /** Warehouse ("Kho") this line is received into. */
  storageId: string;
  storageLabel: string;
  /** Bin / shelf location ("Vị trí") within the line's warehouse. */
  locationId: string;
  locationLabel: string;
  orderedQuantity: number;
  unitPrice: number;
  notes: string;
}

const emptyLine = (): FormLine => ({
  itemId: "",
  itemLabel: "",
  itemName: "",
  unit: "",
  storageId: "",
  storageLabel: "",
  locationId: "",
  locationLabel: "",
  orderedQuantity: 1,
  unitPrice: 0,
  notes: "",
});

const getPersistableFormLines = (nextLines: FormLine[]) =>
  getPersistableLines(nextLines);

const normalizeFormLines = (nextLines: FormLine[]) =>
  ensureTrailingBlankLine(nextLines, emptyLine);

function PurchaseOrderFormDialog({
  mode,
  initial,
  providers,
  storages,
  actionLoading,
  previewDocumentNumber,
  onClose,
  onSaved,
  onEdit,
  onVoid,
  onRequestDelete,
}: {
  mode: "create" | "edit" | "view";
  initial: PurchaseOrder | null;
  providers: InventoryProvider[];
  storages: InventoryStorage[];
  actionLoading: boolean;
  previewDocumentNumber?: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onEdit: () => void;
  /** Void/reverse the receipt → "Hoãn" toolbar button. */
  onVoid?: () => void;
  onRequestDelete?: () => void;
}) {
  const navigate = useNavigate();
  const isView = mode === "view";
  // Resolve preferred shelves for many lines in a single request, then apply
  // each result back to its row. The (idx, itemId, storageId) guard prevents a
  // stale response from overwriting a row the user has since changed.
  const fillPreferredShelfBatch = (
    rows: { idx: number; itemId: string; storageId: string }[],
  ) => {
    const valid = rows.filter((r) => r.itemId && r.storageId);
    if (valid.length === 0) return;
    const pairs = [
      ...new Map(
        valid.map((r) => [
          `${r.itemId}:${r.storageId}`,
          { itemId: r.itemId, storageId: r.storageId },
        ]),
      ).values(),
    ];
    void getPreferredShelfBatch(pairs)
      .then((results) => {
        const shelfByKey = new Map(
          results.map((r) => [`${r.itemId}:${r.storageId}`, r.shelf]),
        );
        setLines((currentLines) =>
          currentLines.map((line, lineIdx) => {
            const match = valid.find(
              (r) =>
                r.idx === lineIdx &&
                line.itemId === r.itemId &&
                line.storageId === r.storageId,
            );
            if (!match) return line;
            const shelf = shelfByKey.get(`${match.itemId}:${match.storageId}`);
            if (!shelf) return line;
            return { ...line, locationId: shelf.id, locationLabel: shelf.code };
          }),
        );
      })
      .catch(() => {});
  };

  const fillPreferredShelf = (
    idx: number,
    itemId: string,
    storageId: string,
  ) => fillPreferredShelfBatch([{ idx, itemId, storageId }]);

  const initialProvider = useMemo(() => {
    if (!initial || !initial.providerId) return { code: "", name: "" };
    if (initial.provider)
      return { code: initial.provider.code, name: initial.provider.name };
    const p = providers.find((x) => x.id === initial.providerId);
    return p
      ? { code: p.code, name: p.name }
      : { code: initial.providerId ?? "", name: "" };
  }, [initial, providers]);

  const [providerId, setProviderId] = useState(
    initial?.counterpartyId ?? initial?.providerId ?? "",
  );
  const [providerCode, setProviderCode] = useState(initialProvider.code);
  const [providerName, setProviderName] = useState(initialProvider.name);
  // Đối tượng kind (supplier | customer | employee). Legacy rows with a
  // provider but no kind are treated as suppliers.
  const [counterpartyKind, setCounterpartyKind] = useState<
    "supplier" | "customer" | "employee" | ""
  >(initial?.counterpartyKind ?? (initial?.providerId ? "supplier" : ""));
  /**
   * Storage = warehouse ("Kho"). The DB still stores a `locationId` (bin) on
   * the receipt header for legacy reasons, but the UI lets users pick a
   * warehouse here and a bin per-line. On save the header `locationId` is
   * derived from the first line's bin so the existing NOT NULL column stays
   * happy without a schema migration.
   */
  // On a fresh create, default the warehouse to the branch's main storage
  // (fallback: first available) so the first line's Kho is pre-filled.
  const defaultStorage = useMemo(
    () => storages.find((s) => s.isMainStorage) ?? storages[0] ?? null,
    [storages],
  );
  const initialStorageId = initial
    ? (initial.location?.storageId ?? "")
    : (defaultStorage?.id ?? "");
  const initialStorageLabel = initial
    ? initial.location?.storageId
      ? (storages.find((s) => s.id === initial.location!.storageId)?.name ?? "")
      : ""
    : (defaultStorage?.name ?? "");
  const [storageId, setStorageId] = useState(initialStorageId);
  const [storageQuery, setStorageQuery] = useState(initialStorageLabel);
  const [purpose, setPurpose] = useState<"OTHER" | "TRANSFER">(
    initial?.purpose === "TRANSFER_IN" ? "TRANSFER" : "OTHER",
  );
  const [sourceBranchId, setSourceBranchId] = useState(
    initial?.sourceBranchId ?? "",
  );
  const [sourceBranchLabel, setSourceBranchLabel] = useState("");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [deliveryPerson, setDeliveryPerson] = useState(
    initial?.deliveredBy ?? "",
  );
  const [notes, setNotes] = useState(initial?.description ?? "");
  // "Chọn chứng từ điều chuyển": when set, this receipt is the import leg of a
  // transfer order — Save calls the transfer import endpoint instead of creating
  // a standalone goods receipt, and the detail is locked.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourceTransferOrderId, setSourceTransferOrderId] = useState<
    string | null
  >(null);
  const [references, setReferences] = useState<string[]>(
    initial?.references ?? [],
  );
  // Lines come from the transfer order — lock Mã SKU / Số lượng / Đơn giá and
  // add/delete, but leave Kho + Vị trí editable so the user picks where to
  // receive (Vị trí auto-fills from the product's arrangement).
  const linesLocked = isView || sourceTransferOrderId !== null;
  const initialReceivedAt = initial?.receivedAt
    ? new Date(initial.receivedAt)
    : new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const [docDate, setDocDate] = useState(
    `${initialReceivedAt.getFullYear()}-${pad2(initialReceivedAt.getMonth() + 1)}-${pad2(initialReceivedAt.getDate())}`,
  );
  const [docTime, setDocTime] = useState(
    `${pad2(initialReceivedAt.getHours())}:${pad2(initialReceivedAt.getMinutes())}`,
  );
  const [lines, setLines] = useState<FormLine[]>(() => {
    if (!initial) return [emptyLine()];

    const initialLines = initial.lines.map((l) => ({
      itemId: l.itemId,
      itemLabel: l.item?.code ?? l.itemId.slice(0, 8),
      itemName: l.item?.name ?? "",
      unit: l.uomCode ?? "",
      storageId: l.location?.storageId ?? "",
      storageLabel:
        storages.find((s) => s.id === l.location?.storageId)?.name ?? "",
      locationId: l.locationId,
      locationLabel: l.location?.code ?? l.locationId.slice(0, 8),
      orderedQuantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      notes: l.note ?? "",
    }));

    return isView ? initialLines : normalizeFormLines(initialLines);
  });

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // "Tham chiếu": when this receipt was auto-generated from a stock-take
  // ("Xử lý"), resolve the originating phiếu kiểm kê's document number (KK…).
  const [stockTakeRefNumber, setStockTakeRefNumber] = useState<
    string | undefined
  >(undefined);
  const stockTakeRefId =
    initial?.referenceType === "STOCK_TAKE" ? initial.referenceId : undefined;
  useEffect(() => {
    if (!stockTakeRefId) {
      setStockTakeRefNumber(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<{ documentNumber?: string }>(
          `/inventory/stock-takes/${stockTakeRefId}`,
        );
        if (!cancelled) setStockTakeRefNumber(data.documentNumber ?? undefined);
      } catch {
        // best-effort — the reference is informational only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stockTakeRefId]);

  // The read carries only source_branch_id (no name) — resolve the branch label
  // so "Chọn cửa hàng nguồn" shows it when viewing/editing a transfer-in receipt.
  useEffect(() => {
    if (!initial?.sourceBranchId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<{ name?: string }>(
          `/branches/${initial.sourceBranchId}`,
        );
        if (!cancelled) setSourceBranchLabel(data.name ?? "");
      } catch {
        // best-effort — the label is informational
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.sourceBranchId]);

  const [quickProviderOpen, setQuickProviderOpen] = useState(false);
  /** Line index that triggered the quick-create-location dialog, or null. */
  const [quickLocationLineIdx, setQuickLocationLineIdx] = useState<
    number | null
  >(null);
  const [quickItemLineIdx, setQuickItemLineIdx] = useState<number | null>(null);
  const [chooseKhoOpen, setChooseKhoOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [storageCache, setStorageCache] = useState<
    Array<{ id: string; name: string; branchId: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "200" });
        const branchId = getActiveBranchId();
        if (branchId) params.set("branchId", branchId);
        const { data } = await apiClient.get<
          PaginatedResponse<{ id: string; name: string; branchId: string }>
        >(`/inventory/storages?${params}`);
        if (!cancelled) setStorageCache(data.data);
      } catch {
        // best-effort — quick-create location modal will show empty list
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If the dialog opens for a new receipt before warehouses finished loading,
  // back-fill the default (main) storage once it arrives — but never override a
  // warehouse the user already picked or an existing receipt's saved warehouse.
  useEffect(() => {
    if (initial || storageId || !defaultStorage) return;
    setStorageId(defaultStorage.id);
    setStorageQuery(defaultStorage.name);
  }, [initial, storageId, defaultStorage]);

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const handleApplyDraftImport = useCallback(
    (importedRows: GoodsReceiptImportJobRow[]) => {
      const mapped = importedRows.flatMap((row) => {
        const normalized = row.normalizedData;
        if (!normalized) return [];
        return [
          {
            itemId: normalized.itemId,
            itemLabel: normalized.itemCode,
            itemName: normalized.itemName,
            unit: normalized.unit,
            storageId: normalized.storageId,
            storageLabel: normalized.storageName,
            locationId: normalized.locationId,
            locationLabel: normalized.locationCode,
            orderedQuantity: normalized.quantity,
            unitPrice: normalized.unitPrice,
            notes: normalized.note,
          },
        ];
      });
      setLines(normalizeFormLines(mapped));
      if (mapped[0]) {
        setStorageId(mapped[0].storageId);
        setStorageQuery(mapped[0].storageLabel);
      }
      setDirty(true);
    },
    [],
  );

  /** Load a picked transfer order into the form as the import leg (locked detail). */
  const prefillFromTransferOrder = useCallback(
    (detail: TransferReceiptDetail, row: ImportableTransferOrderListItem) => {
      setPurpose("TRANSFER");
      setSourceBranchId(detail.sourceBranchId);
      setSourceBranchLabel(row.sourceBranchName);
      const xk =
        row.exportGoodsIssueDocumentNumber ?? detail.documentNumber ?? "";
      setReferences(xk ? [xk] : []);
      setSourceTransferOrderId(detail.id);
      setNotes(
        `Nhập kho hàng hóa điều chuyển từ cửa hàng ${row.sourceBranchName}`,
      );
      // Lines come from the transfer order; the destination bin is resolved
      // server-side from the chosen Kho nhận, so line Kho/Vị trí stay blank.
      const mapped: FormLine[] = detail.lines.map((l) => ({
        itemId: l.itemId,
        itemLabel: l.item?.code ?? "",
        itemName: l.item?.name ?? "",
        unit: l.item?.unit ?? "",
        storageId: "",
        storageLabel: "",
        locationId: "",
        locationLabel: "",
        orderedQuantity: Number(l.requestedQty),
        unitPrice: Number(l.item?.purchasePrice ?? 0),
        notes: l.note ?? "",
      }));
      setLines(mapped);
      markDirty();
    },
    // markDirty/set* are stable closures over component scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Unlink the transfer order — the form reverts to a plain goods receipt. */
  const clearTransferSource = () => {
    setSourceTransferOrderId(null);
    setReferences([]);
    markDirty();
  };

  /**
   * Auto-fill a line's Vị trí from the product's arranged bin ("đã sắp") in the
   * chosen Kho. No-op when the product isn't arranged there. Best-effort: only
   * fills if the row still points at the same Kho with no bin picked meanwhile.
   */
  const autoFillAssignedLocation = useCallback(
    async (idx: number, itemId: string, storageId: string) => {
      try {
        const { data } = await apiClient.get<{
          locationId: string;
          code: string;
        } | null>(
          `/products/storage-location?itemId=${encodeURIComponent(itemId)}&storageId=${encodeURIComponent(storageId)}`,
        );
        if (!data) return;
        setLines((prev) =>
          prev.map((l, i) =>
            i === idx && l.storageId === storageId && !l.locationId
              ? { ...l, locationId: data.locationId, locationLabel: data.code }
              : l,
          ),
        );
      } catch {
        // best-effort — the user can still pick Vị trí manually
      }
    },
    [],
  );

  // Multi-select product picker → append one line per chosen item (dedupe by itemId),
  // pre-filling Số lượng/Đơn giá from the dialog and the warehouse from "Chọn kho"/default.
  const addLinesFromPicker = (result: ProductSelectResult) => {
    const existing = new Set(lines.map((l) => l.itemId).filter(Boolean));
    const fallbackStorageId = storageId || defaultStorage?.id || "";
    const fallbackStorageLabel = storageQuery || defaultStorage?.name || "";
    const fresh: FormLine[] = result.lines
      .filter((s) => s.itemId && !existing.has(s.itemId))
      .map((s) => ({
        itemId: s.itemId,
        itemLabel: s.sku,
        itemName: s.name,
        unit: s.unit,
        storageId: fallbackStorageId,
        storageLabel: fallbackStorageLabel,
        locationId: "",
        locationLabel: "",
        orderedQuantity: s.quantity > 0 ? s.quantity : 1,
        unitPrice: s.unitPrice > 0 ? s.unitPrice : Number(s.purchasePrice ?? 0) || 0,
        notes: "",
      }));
    if (fresh.length === 0) return;
    const base = getPersistableFormLines(lines);
    const startIdx = base.length;
    setLines(normalizeFormLines([...base, ...fresh]));
    markDirty();
    fillPreferredShelfBatch(
      fresh.map((line, i) => ({
        idx: startIdx + i,
        itemId: line.itemId,
        storageId: line.storageId,
      })),
    );
  };

  const searchStorages = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const q = query.trim().toLowerCase();
      // Storages list is small — filter the cached page client-side rather
      // than hitting the API on every keystroke. The page-level fetch
      // already pulls up to 200 storages, which covers all real orgs.
      const filtered = q
        ? storages.filter((s) => s.name.toLowerCase().includes(q))
        : storages;
      const effectivePageSize = pageSize ?? 8;
      const start = (page - 1) * effectivePageSize;
      const items = filtered.slice(start, start + effectivePageSize);
      return {
        items,
        hasMore: start + effectivePageSize < filtered.length,
        total: filtered.length,
      };
    },
    [storages],
  );

  const searchLocationsForStorage = useCallback(
    async (
      storageIdArg: string,
      query: string,
      page: number,
      pageSize?: number,
    ) => {
      if (!storageIdArg) return { items: [], hasMore: false, total: 0 };
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        search: query.trim(),
        storageId: storageIdArg,
      });
      const { data } = await apiClient.get<
        PaginatedResponse<InventoryLocation>
      >(`/inventory/locations?${params}`);
      const fetched = data.page * data.pageSize;
      return {
        items: data.data,
        hasMore: fetched < data.total,
        total: data.total,
      };
    },
    [],
  );

  const searchItems = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 10;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        search: query.trim(),
      });
      const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>(
        `/inventory/items?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return {
        items: data.data,
        hasMore: fetched < data.total,
        total: data.total,
      };
    },
    [],
  );

  const searchBranches = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 8;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
      });
      if (query.trim()) params.set("search", query.trim());
      const { data } = await apiClient.get<
        PaginatedResponse<{ id: string; name: string; address?: string | null }>
      >(`/branches?${params}`);
      const activeBranchId = getActiveBranchId();
      const items = activeBranchId
        ? data.data.filter((branch) => branch.id !== activeBranchId)
        : data.data;
      const fetched = data.page * data.pageSize;
      return {
        items,
        hasMore: fetched < data.total,
        total: Math.max(
          0,
          data.total - (items.length < data.data.length ? 1 : 0),
        ),
      };
    },
    [],
  );

  const summaryLines = getPersistableFormLines(lines);
  const totalQty = summaryLines.reduce(
    (s, l) => s + Number(l.orderedQuantity || 0),
    0,
  );
  const totalAmount = summaryLines.reduce(
    (s, l) => s + Number(l.orderedQuantity || 0) * Number(l.unitPrice || 0),
    0,
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (purpose === "OTHER" && !providerId) {
      toast.error("Vui lòng chọn đối tượng (NCC).");
      return false;
    }
    const persistableLines = getPersistableFormLines(lines);
    if (persistableLines.length === 0) {
      toast.error("Cần ít nhất 1 dòng hàng hợp lệ.");
      return false;
    }
    if (persistableLines.some((l) => !l.storageId)) {
      toast.error("Mỗi dòng hàng phải chọn kho.");
      return false;
    }
    setSaving(true);
    try {
      // Resolve a concrete bin per line. Lines may sit in different warehouses,
      // so fall back to the first bin of each line's OWN warehouse (cached).
      const fallbackByStorage = new Map<string, string>();
      const resolvedLines: FormLine[] = [];
      for (const l of persistableLines) {
        let locationId = l.locationId;
        if (!locationId) {
          let fb = fallbackByStorage.get(l.storageId);
          if (fb === undefined) {
            const { data } = await apiClient.get<
              PaginatedResponse<InventoryLocation>
            >(
              `/inventory/locations?page=1&pageSize=50&storageId=${encodeURIComponent(l.storageId)}&includeUnassigned=true`,
            );
            const locations = data.data;
            if (!locations || locations.length === 0) {
              toast.error(
                "Có kho chưa có vị trí nào. Vui lòng tạo ít nhất 1 vị trí trước.",
              );
              setSaving(false);
              return false;
            }
            const unassigned =
              locations.find((loc) => loc.isUnassigned === true) ??
              locations.find((loc) => loc.code === "__UNASSIGNED__") ??
              locations[0];
            fb = unassigned.id;
            fallbackByStorage.set(l.storageId, fb);
          }
          locationId = fb;
        }
        resolvedLines.push({ ...l, locationId });
      }

      const receivedAtIso = combineDateTimeISO(docDate, docTime);
      // The header.locationId is a legacy anchor — use the first line's bin so
      // the backend's NOT NULL stays satisfied. Lines carry the real kho/bin
      // per row (with fallback applied above).
      const headerLocationId = resolvedLines[0]?.locationId ?? "";
      const payload = {
        purpose: purpose === "TRANSFER" ? "TRANSFER_IN" : "OTHER",
        counterpartyKind: counterpartyKind || undefined,
        counterpartyId: providerId || undefined,
        deliveredBy: deliveryPerson || undefined,
        reason: reason || undefined,
        description: notes || undefined,
        sourceBranchId:
          purpose === "TRANSFER" ? sourceBranchId || undefined : undefined,
        receivedAt: receivedAtIso,
        locationId: headerLocationId,
        lines: resolvedLines.map((l) => ({
          itemId: l.itemId,
          locationId: l.locationId,
          uomCode: l.unit || "Cái",
          quantity: Number(l.orderedQuantity),
          unitPrice: Number(l.unitPrice),
          note: l.notes || undefined,
        })),
      };
      if (sourceTransferOrderId) {
        // Import leg of a transfer order: post via the two-phase import endpoint
        // with the form's per-line Kho/Vị trí + header fields. Advances the
        // order IN_PROGRESS → COMPLETED server-side.
        await apiClient.post(
          `/inventory/transfer-orders/${sourceTransferOrderId}/import`,
          {
            lines: resolvedLines.map((l) => ({
              itemId: l.itemId,
              locationId: l.locationId,
              quantity: Number(l.orderedQuantity),
              unitPrice: Number(l.unitPrice),
              note: l.notes || undefined,
            })),
            providerId: providerId || undefined,
            deliverer: deliveryPerson || undefined,
            references: references.length ? references : undefined,
            occurredAt: receivedAtIso,
          },
        );
      } else if (initial && mode === "edit") {
        await apiClient.patch(`/goods-receipts/${initial.id}`, payload);
      } else {
        // Create now saves + posts atomically: the phiếu lands POSTED with the
        // stock ledger written, so it appears in reports immediately.
        await apiClient.post("/goods-receipts", payload);
      }
      setDirty(false);
      toast.success(
        mode === "edit"
          ? "Đã cập nhật phiếu nhập kho."
          : "Đã nhập kho thành công.",
      );
      await onSaved();
      return true;
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    purpose,
    providerId,
    lines,
    docDate,
    docTime,
    notes,
    reason,
    deliveryPerson,
    sourceBranchId,
    sourceTransferOrderId,
    references,
    initial,
    mode,
    onSaved,
  ]);

  const requestClose = () => {
    if (dirtyRef.current && !isView) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  };

  const handleUnsavedChoice = async (choice: UnsavedChangesChoice) => {
    if (choice === "save") {
      const ok = await handleSave();
      if (ok) onClose();
    } else if (choice === "discard") {
      onClose();
    }
  };

  const dialogToolbar: ToolbarItem[] = [
    {
      id: "prev",
      label: "Trước",
      icon: ChevronLeft,
      disabled: true,
      onClick: () => {},
    },
    {
      id: "next",
      label: "Sau",
      icon: ChevronRight,
      disabled: true,
      onClick: () => {},
    },
    { id: "sep1", type: "separator" },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !isView || initial?.status !== "DRAFT",
      onClick: onEdit,
    },
    {
      id: "save",
      label: "Lưu",
      icon: Save,
      disabled: isView || saving,
      onClick: () => void handleSave(),
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled: !onRequestDelete,
      onClick: () => onRequestDelete?.(),
    },
    {
      id: "void",
      label: "Hoãn",
      icon: RotateCcw,
      disabled: true,
      onClick: () => onVoid?.(),
    },
    { id: "sep2", type: "separator" },
    {
      id: "print",
      label: "In",
      icon: Printer,
      disabled: true,
      onClick: () => {},
    },
    {
      id: "export",
      label: "Xuất khẩu",
      icon: CloudUpload,
      disabled: true,
      onClick: () => {},
    },
    { id: "help", label: "Trợ giúp", icon: HelpCircle, onClick: () => {} },
    { id: "close", label: "Đóng", icon: X, onClick: requestClose },
  ];

  // Fill the line at `idx` from a selected item — shared by the inline
  // typeahead (onSelect) and the single-fill ProductSelectDialog.
  const fillLineFromItem = (
    idx: number,
    item: {
      id: string;
      code: string;
      name: string;
      unit: string;
      purchasePrice?: number | string | null;
    },
  ) => {
    const defaultUnitPrice = Number(item.purchasePrice ?? 0) || 0;
    let selectedStorageId = "";
    let selectedStorageLabel = "";
    setLines((prev) => {
      const updated = prev.map((l, i) => {
        if (i !== idx) return l;
        selectedStorageId = l.storageId;
        selectedStorageLabel = l.storageLabel;
        if (!selectedStorageId) {
          for (let j = i - 1; j >= 0; j--) {
            if (prev[j].storageId) {
              selectedStorageId = prev[j].storageId;
              selectedStorageLabel = prev[j].storageLabel;
              break;
            }
          }
        }
        if (!selectedStorageId) {
          selectedStorageId = storageId;
          selectedStorageLabel = storageQuery;
        }
        return {
          ...l,
          itemId: item.id,
          itemLabel: item.code,
          itemName: item.name,
          unit: item.unit,
          storageId: selectedStorageId,
          storageLabel: selectedStorageLabel,
          locationId: "",
          locationLabel: "",
          unitPrice: defaultUnitPrice,
        };
      });

      if (selectedStorageId) {
        fillPreferredShelf(idx, item.id, selectedStorageId);
      }

      return normalizeFormLines(updated);
    });
    markDirty();
  };

  const lineColumns: LineColumn<FormLine>[] = [
    {
      key: "itemLabel",
      label: "Mã SKU",
      width: 360,
      minWidth: 360,
      placeholder: "Tìm mã hoặc tên",
      renderEditor: (row, idx) => (
        <div className="flex h-full items-center gap-1">
        <LookupField
          portalToBody
          onSearchButtonClick={() => setProductPickerOpen(true)}
          dropdownMinWidth={520}
          placeholder="Tìm mã hoặc tên"
          value={row.itemLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      itemLabel: val,
                      itemName: "",
                      itemId: "",
                      locationId: "",
                      locationLabel: "",
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          onSelect={(item) => fillLineFromItem(idx, item)}
          search={searchItems}
          itemKey={(item) => item.id}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.code} · ${item.unit}`}
          columns={[
            {
              key: "code",
              label: "Mã",
              className: "w-[120px] font-mono",
              render: (it) => it.code,
            },
            { key: "name", label: "Tên hàng hóa", render: (it) => it.name },
            {
              key: "unit",
              label: "ĐVT",
              className: "w-[80px]",
              render: (it) => it.unit,
            },
          ]}
          disabled={linesLocked}
          onCreateNew={linesLocked ? undefined : () => setQuickItemLineIdx(idx)}
          className="h-full flex-1"
        />
        </div>
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 280,
      minWidth: 280,
      type: "readonly",
      getValue: (row) => row.itemName,
    },
    {
      key: "warehouse",
      label: "Kho",
      width: 220,
      minWidth: 220,
      placeholder: "Chọn kho",
      renderEditor: (row, idx) => (
        <LookupField
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn kho"
          searchModalPlaceholder="Nhập tên kho"
          dropdownMinWidth={320}
          placeholder="Chọn kho"
          value={row.storageLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      storageLabel: val,
                      storageId: "",
                      locationId: "",
                      locationLabel: "",
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          onSelect={(s) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      storageId: s.id,
                      storageLabel: s.name,
                      locationId: "",
                      locationLabel: "",
                    }
                  : l,
              ),
            );
            if (row.itemId) {
              fillPreferredShelf(idx, row.itemId, s.id);
            }
            markDirty();
            // Auto-fill Vị trí from the product's arrangement ("đã sắp").
            if (row.itemId)
              void autoFillAssignedLocation(idx, row.itemId, s.id);
          }}
          search={searchStorages}
          itemKey={(s) => s.id}
          renderItem={(s) => s.name}
          renderMeta={() => ""}
          columns={[{ key: "name", label: "Tên kho", render: (s) => s.name }]}
          disabled={isView}
          className="h-full"
        />
      ),
    },
    {
      key: "position",
      label: "Vị trí",
      width: 220,
      minWidth: 220,
      placeholder: "Chọn vị trí",
      renderEditor: (row, idx) => (
        <LookupField<InventoryLocation>
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn vị trí"
          searchModalPlaceholder="Nhập mã hoặc tên vị trí"
          dropdownMinWidth={360}
          placeholder={row.storageId ? "Chọn vị trí" : "Chọn kho trước"}
          value={row.locationLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx ? { ...l, locationLabel: val, locationId: "" } : l,
              ),
            );
            markDirty();
          }}
          onSelect={(loc) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, locationId: loc.id, locationLabel: loc.code }
                  : l,
              ),
            );
            markDirty();
          }}
          search={(q, p, ps) =>
            searchLocationsForStorage(row.storageId, q, p, ps)
          }
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          columns={[
            {
              key: "code",
              label: "Mã",
              className: "w-[120px] font-mono",
              render: (l) => l.code,
            },
            { key: "name", label: "Tên vị trí", render: (l) => l.name },
          ]}
          disabled={isView || !row.storageId}
          onCreateNew={
            isView || !row.storageId
              ? undefined
              : () => setQuickLocationLineIdx(idx)
          }
          className="h-full"
        />
      ),
    },
    {
      key: "unit",
      label: "Đơn vị tính",
      width: 100,
      minWidth: 100,
      type: "readonly",
      getValue: (r) => r.unit || "Đôi",
    },
    {
      key: "orderedQuantity",
      label: "Số lượng",
      width: 110,
      minWidth: 110,
      type: "number",
      align: "right",
      filterSymbol: "≤",
    },
    {
      key: "unitPrice",
      label: "Đơn giá",
      width: 140,
      minWidth: 140,
      align: "right",
      filterSymbol: "≤",
      renderEditor: (row, idx) => (
        <MoneyInput
          disabled={linesLocked}
          className="h-full w-full rounded-none border-0 bg-transparent px-1 text-right shadow-none"
          value={row.unitPrice === 0 ? "" : row.unitPrice}
          onChange={(v) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx ? { ...l, unitPrice: v === "" ? 0 : Number(v) } : l,
              ),
            );
            markDirty();
          }}
        />
      ),
    },
    {
      key: "lineTotal",
      label: "Thành tiền",
      width: 150,
      minWidth: 150,
      type: "readonly",
      align: "right",
      filterSymbol: "≤",
      getValue: (r) =>
        formatMoneyInteger(Number(r.orderedQuantity) * Number(r.unitPrice)),
    },
    { key: "notes", label: "Ghi chú", width: 200, minWidth: 200 },
  ];

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
        title={
          mode === "create"
            ? "Thêm mới phiếu nhập kho"
            : `Phiếu nhập kho ${initial?.documentNumber ?? ""}`
        }
        toolbarItems={dialogToolbar}
        purpose={
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="text-muted-foreground">Mục đích nhập kho</span>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={purpose === "OTHER"}
                onChange={() => {
                  setPurpose("OTHER");
                  setSourceBranchId("");
                  setSourceBranchLabel("");
                  markDirty();
                }}
                disabled={isView}
              />
              Khác
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={purpose === "TRANSFER"}
                onChange={() => {
                  setPurpose("TRANSFER");
                  markDirty();
                }}
                disabled={isView}
              />
              Điều chuyển từ cửa hàng khác
            </label>
            {purpose === "TRANSFER" ? (
              <>
                <div className="w-[260px]">
                  <LookupField
                    enableSearchModal
                    searchModalTitle="Chọn cửa hàng nguồn"
                    searchModalPlaceholder="Nhập tên cửa hàng"
                    placeholder="Chọn cửa hàng nguồn"
                    value={sourceBranchLabel}
                    onValueChange={(v) => {
                      setSourceBranchLabel(v);
                      setSourceBranchId("");
                    }}
                    onSelect={(b) => {
                      setSourceBranchId(b.id);
                      setSourceBranchLabel(b.name);
                      setNotes(
                        `Nhập kho hàng hóa điều chuyển từ cửa hàng ${b.name}`,
                      );
                      markDirty();
                    }}
                    search={searchBranches}
                    itemKey={(b) => b.id}
                    renderItem={(b) => b.name}
                    renderMeta={(b) => b.address ?? ""}
                    columns={[
                      {
                        key: "name",
                        label: "Tên cửa hàng",
                        render: (b) => b.name,
                      },
                      {
                        key: "address",
                        label: "Địa chỉ",
                        render: (b) => b.address ?? "—",
                      },
                    ]}
                    disabled={isView}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                  disabled={isView}
                >
                  Chọn chứng từ điều chuyển
                </Button>
              </>
            ) : null}
          </div>
        }
        generalInfo={
          <>
            <FieldRow label="Đối tượng">
              <div className="flex items-stretch gap-2">
                <CounterpartyPickerField
                  defaultType="supplier"
                  allowedTypes={["supplier", "customer", "employee"]}
                  className="w-[180px]"
                  dropdownMinWidth={500}
                  modalTitle="Chọn đối tượng"
                  modalPlaceholder="Nhập mã hoặc tên đối tượng"
                  value={providerCode}
                  onValueChange={(v) => {
                    setProviderCode(v);
                    setProviderId("");
                    setProviderName("");
                    setCounterpartyKind("");
                    markDirty();
                  }}
                  onSelect={(c) => {
                    setProviderId(c.id);
                    setProviderCode(c.code ?? "");
                    setProviderName(c.name);
                    setCounterpartyKind(c.kind);
                    markDirty();
                  }}
                  disabled={isView}
                  onCreateNew={
                    isView ? undefined : () => setQuickProviderOpen(true)
                  }
                />
                <Input
                  className="flex-1"
                  placeholder="Tên đối tượng"
                  value={providerName}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </FieldRow>
            <FieldRow label="Người giao">
              <Input
                value={deliveryPerson}
                onChange={(e) => {
                  setDeliveryPerson(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            {purpose === "TRANSFER" ? null : (
              <FieldRow label="Lý do">
                <Input
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    markDirty();
                  }}
                  disabled={isView}
                />
              </FieldRow>
            )}
            <FieldRow label="Diễn giải">
              <Input
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Tham chiếu">
              {(() => {
                // FE-supplied reference list (e.g. the source XK number), plus
                // any resolved stock-take linkage not already in it.
                const refs = [
                  ...references,
                  ...(stockTakeRefNumber &&
                  !references.includes(stockTakeRefNumber)
                    ? [stockTakeRefNumber]
                    : []),
                ];
                return refs.length ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {refs.map((r) =>
                      r === stockTakeRefNumber && stockTakeRefId ? (
                        <button
                          key={r}
                          type="button"
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-medium text-primary-blue hover:text-primary-blue-hover hover:underline"
                          onClick={() =>
                            navigate("/inventory/stock-takes", {
                              state: { openDocumentId: stockTakeRefId },
                            })
                          }
                        >
                          {r}
                        </button>
                      ) : (
                        <span
                          key={r}
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-medium text-foreground"
                        >
                          {r}
                        </span>
                      ),
                    )}
                    {sourceTransferOrderId && !isView ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-destructive hover:underline"
                        title="Gỡ liên kết chứng từ điều chuyển"
                        onClick={clearTransferSource}
                      >
                        (x)
                      </button>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                );
              })()}
            </FieldRow>
            <FieldRow label="Tài liệu đính kèm">
              <Button type="button" variant="outline" size="sm" disabled>
                Tải tệp …
              </Button>
            </FieldRow>
          </>
        }
        documentInfo={
          <>
            <FieldRow label="Số phiếu nhập">
              <Input
                value={initial?.documentNumber ?? previewDocumentNumber ?? ""}
                readOnly
                title={
                  initial?.documentNumber
                    ? undefined
                    : "Số dự kiến — hệ thống sẽ chốt khi lưu"
                }
              />
            </FieldRow>
            <FieldRow label="Ngày nhập">
              <Input
                type="date"
                value={docDate}
                onChange={(e) => {
                  setDocDate(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Giờ nhập">
              <Input
                type="time"
                value={docTime}
                onChange={(e) => {
                  setDocTime(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
          </>
        }
        detailActions={
          <>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" disabled />
              <span>Quét mã vạch</span>
            </label>
            <button
              type="button"
              onClick={() => setChooseKhoOpen(true)}
              className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover"
            >
              Chọn kho
            </button>
            <button
              type="button"
              disabled={linesLocked || saving}
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Nhập khẩu
            </button>
          </>
        }
        detail={
          <LineItemGrid
            columns={lineColumns}
            rows={lines}
            // Omitting onChangeCell makes the built-in cells (Số lượng) read-only.
            onChangeCell={
              linesLocked
                ? undefined
                : (idx, key, value) => {
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, [key]: value } : l,
                      ),
                    );
                    markDirty();
                  }
            }
            onAddRow={() => {
              setLines((prev) => normalizeFormLines([...prev, emptyLine()]));
              markDirty();
            }}
            onDeleteRow={(idx) => {
              setLines((prev) =>
                normalizeFormLines(prev.filter((_, i) => i !== idx)),
              );
              markDirty();
            }}
            showAddRow={!linesLocked}
            showRowActions={!linesLocked}
          />
        }
        footerSummary={
          <div className="flex items-center justify-between">
            <span>Số dòng = {lines.length}</span>
            <div className="flex gap-8">
              <span>
                Số lượng: <strong className="ml-1">{totalQty}</strong>
              </span>
              <span>
                Thành tiền:{" "}
                <strong className="ml-1">
                  {formatMoneyInteger(totalAmount)}
                </strong>
              </span>
            </div>
          </div>
        }
      />

      <UnsavedChangesDialog
        open={unsavedOpen}
        onOpenChange={setUnsavedOpen}
        onChoose={(c) => void handleUnsavedChoice(c)}
        saveDisabled={actionLoading || saving}
      />

      <QuickCreateProviderDialog
        open={quickProviderOpen}
        onClose={() => setQuickProviderOpen(false)}
        onCreated={(p: QuickProvider) => {
          setProviderId(p.id);
          setProviderCode(p.code);
          setProviderName(p.name);
          markDirty();
        }}
      />

      <QuickCreateLocationDialog
        open={quickLocationLineIdx !== null}
        onClose={() => setQuickLocationLineIdx(null)}
        onCreated={(loc: QuickLocation) => {
          const idx = quickLocationLineIdx;
          if (idx === null) return;
          setLines((prev) =>
            prev.map((l, i) =>
              i === idx
                ? { ...l, locationId: loc.id, locationLabel: loc.code }
                : l,
            ),
          );
          setQuickLocationLineIdx(null);
          markDirty();
        }}
        storages={storageCache}
      />

      <QuickCreateItemDialog
        open={quickItemLineIdx !== null}
        onClose={() => setQuickItemLineIdx(null)}
        onCreated={(item: QuickItem) => {
          const idx = quickItemLineIdx;
          if (idx === null) return;
          setLines((prev) =>
            normalizeFormLines(
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      itemId: item.id,
                      itemLabel: item.code,
                      itemName: item.name,
                      unit: item.unit,
                      unitPrice: Number(item.purchasePrice ?? 0),
                    }
                  : l,
              ),
            ),
          );
          setQuickItemLineIdx(null);
          markDirty();
        }}
      />

      {chooseKhoOpen && (
        <ChooseWarehouseDialog
          storages={storages}
          fieldLabel="Kho nhập"
          defaultStorageId={
            getPersistableFormLines(lines).find((l) => l.storageId)?.storageId
          }
          onClose={() => setChooseKhoOpen(false)}
          onConfirm={(s) => {
            setLines((prev) =>
              prev.map((l) => ({
                ...l,
                storageId: s.id,
                storageLabel: s.name,
                locationId: "",
                locationLabel: "",
              })),
            );
            markDirty();
          }}
        />
      )}

      {productPickerOpen && (
        <ProductSelectDialog
          open
          onOpenChange={setProductPickerOpen}
          showQuantityPrice
          defaultUnitPriceSource="purchasePrice"
          onConfirm={addLinesFromPicker}
        />
      )}

      <SelectTransferReceiptDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={prefillFromTransferOrder}
      />

      <GoodsReceiptImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onApplyDraft={handleApplyDraftImport}
      />
    </>
  );
}

function combineDateTimeISO(date: string, time: string): string {
  // date = YYYY-MM-DD, time = HH:mm
  const safeDate = date || new Date().toISOString().slice(0, 10);
  const safeTime = (time && time.length >= 4 ? time : "00:00").slice(0, 5);
  // Build local-time ISO with timezone offset, e.g. 2026-05-14T21:23:00+07:00
  const d = new Date(`${safeDate}T${safeTime}:00`);
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const offsetH = pad(tz / 60);
  const offsetM = pad(tz % 60);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00${sign}${offsetH}:${offsetM}`;
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}
