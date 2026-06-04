import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { SearchListingInput } from "../../components/forms/SearchListingInput";
import { LookupField } from "../../components/forms/LookupField";
import {
  QuickCreateItemDialog,
  QuickCreateLocationDialog,
  QuickCreateProviderDialog,
  type QuickItem,
  type QuickLocation,
  type QuickProvider,
} from "../../components/forms/QuickCreateDialogs";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
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

type GoodsReceiptStatus = "DRAFT" | "POSTED" | "CANCELLED" | "REVERSED";
type GoodsReceiptPurpose = "OTHER" | "TRANSFER_IN";

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
  location?: { id: string; code: string; name: string; storageId?: string } | null;
}

interface GoodsReceipt {
  id: string;
  documentNumber?: string | null;
  status: GoodsReceiptStatus;
  purpose: GoodsReceiptPurpose;
  providerId?: string | null;
  providerName?: string;
  provider?: { id: string; code: string; name: string } | null;
  deliveredBy?: string | null;
  reason?: string | null;
  description?: string | null;
  referenceId?: string | null;
  referenceType?: "PURCHASE_ORDER" | "STOCK_TRANSFER" | null;
  sourceBranchId?: string | null;
  receivedAt: string;
  locationId: string;
  location?: { id: string; code: string; name: string; storageId?: string } | null;
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
}

interface InventoryItem {
  id: string;
  name: string;
  code: string;
  unit: string;
  /** Default purchase price (from item master) — used to auto-fill Đơn giá. */
  purchasePrice?: number | string | null;
}

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Chưa duyệt",
  POSTED: "Đã duyệt",
  CANCELLED: "Đã huỷ",
  REVERSED: "Đã đảo bút",
};

const FILTER_KEYS = [
  "date",
  "documentNumber",
  "subject",
  "totalAmount",
  "notes",
  "reason",
  "documentType",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce((acc, k) => {
    acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
    return acc;
  }, {} as Record<FilterKey, ColumnFilter>);
}

function lineSubtotal(l: { quantity: number | string; unitPrice: number | string; lineTotal?: number | string }): number {
  if (l.lineTotal !== undefined && l.lineTotal !== null && l.lineTotal !== "")
    return Number(l.lineTotal);
  return Number(l.quantity) * Number(l.unitPrice);
}

function orderTotal(o: PurchaseOrder): number {
  return o.lines.reduce((s, l) => s + lineSubtotal(l), 0);
}

export function PurchaseOrdersPage() {
  const [records, setRecords] = useState<PaginatedResponse<PurchaseOrder> | null>(null);
  const [providers, setProviders] = useState<InventoryProvider[]>([]);
  const [storages, setStorages] = useState<InventoryStorage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PurchaseOrder | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const { data } = await apiClient.get<PaginatedResponse<PurchaseOrder>>(
        `/goods-receipts?${params}`,
      );
      setRecords(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [pagination]);

  const loadProviders = useCallback(async () => {
    try {
      const { data } = await apiClient.get<PaginatedResponse<InventoryProvider>>(
        "/inventory/providers?page=1&pageSize=200",
      );
      setProviders(data.data);
    } catch {
      // best-effort; row will fall back to id if name is missing
    }
  }, []);

  const loadStorages = useCallback(async () => {
    try {
      const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
        "/inventory/storages?page=1&pageSize=200",
      );
      setStorages(data.data);
    } catch {
      // best-effort — Storage names will fall back to id in detail panel
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

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

  const handleApprove = async (order: PurchaseOrder) => {
    setActionLoading(order.id);
    try {
      await apiClient.post(`/goods-receipts/${order.id}/post`);
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
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: () => void loadRecords() },
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
      width: 110,
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
      key: "subject",
      label: "Đối tượng",
      width: 180,
      render: (row) =>
        row.provider?.name ??
        (row.providerId ? providerNameById.get(row.providerId) ?? row.providerId : "—"),
    },
    {
      key: "totalAmount",
      label: "Tổng tiền",
      width: 140,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => formatMoneyInteger(orderTotal(row)),
    },
    {
      key: "notes",
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
      key: "documentType",
      label: "Loại chứng từ",
      width: 200,
      render: (row) =>
        row.purpose === "TRANSFER_IN"
          ? "Điều chuyển từ cửa hàng khác"
          : "Phiếu nhập kho khác",
    },
  ];

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], mode },
        })),
      onValueChange: (key: string, value: string) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], value },
        })),
    }),
    [columnFilters],
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
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
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
            <span className="text-base font-semibold">{formatMoneyInteger(totalSum)}</span>
          </div>
        }
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={records?.total ?? 0}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: nextPageSize }))
            }
          />
        }
        detailPanel={
          <DetailPanel order={selectedOrder} storageNameById={storageNameById} />
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
                onChange={() => setSelectedId(selectedId === row.id ? null : row.id)}
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
          onApprove={editingOrder ? () => void handleApprove(editingOrder) : undefined}
          onRequestDelete={editingOrder ? () => setConfirmDelete(editingOrder) : undefined}
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
        <p className="text-sm text-muted-foreground">Chọn một phiếu để xem chi tiết.</p>
      ) : order.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Phiếu này chưa có dòng hàng.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="border-r px-2 py-1.5 text-left font-medium">Mã SKU</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Tên hàng hóa</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Kho</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Vị trí</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Đơn vị tính</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Số lượng</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Đơn giá</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Thành tiền</th>
              <th className="px-2 py-1.5 text-left font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((rawLine) => {
              const line = rawLine as PurchaseOrderLine;
              const itemCode = line.item?.code ?? line.itemCode ?? line.itemId.slice(0, 8);
              const itemName = line.item?.name ?? line.itemName ?? "—";
              const storageId = line.location?.storageId ?? order.location?.storageId;
              const storageName = storageId
                ? storageNameById.get(storageId) ?? storageId.slice(0, 8)
                : "—";
              const binCode = line.location?.code ?? line.location?.name ?? "—";
              const unitLabel = line.item?.unit ?? line.unit ?? line.uomCode ?? "—";
              return (
              <tr key={line.id} className="border-b">
                <td className="border-r px-2 py-1 font-mono text-xs">{itemCode}</td>
                <td className="border-r px-2 py-1">{itemName}</td>
                <td className="border-r px-2 py-1">{storageName}</td>
                <td className="border-r px-2 py-1 font-mono text-xs">{binCode}</td>
                <td className="border-r px-2 py-1">{unitLabel}</td>
                <td className="border-r px-2 py-1 text-right tabular-nums">{Number(line.quantity)}</td>
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
  onApprove,
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
  onApprove?: () => void;
  onRequestDelete?: () => void;
}) {
  const isView = mode === "view";

  const initialProvider = useMemo(() => {
    if (!initial || !initial.providerId) return { code: "", name: "" };
    if (initial.provider) return { code: initial.provider.code, name: initial.provider.name };
    const p = providers.find((x) => x.id === initial.providerId);
    return p ? { code: p.code, name: p.name } : { code: initial.providerId ?? "", name: "" };
  }, [initial, providers]);

  const [providerId, setProviderId] = useState(initial?.providerId ?? "");
  const [providerCode, setProviderCode] = useState(initialProvider.code);
  const [providerName, setProviderName] = useState(initialProvider.name);
  const [purpose, setPurpose] = useState<"OTHER" | "TRANSFER">(
    initial?.purpose === "TRANSFER_IN" ? "TRANSFER" : "OTHER",
  );
  const [sourceBranchId, setSourceBranchId] = useState(initial?.sourceBranchId ?? "");
  const [sourceBranchLabel, setSourceBranchLabel] = useState("");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [deliveryPerson, setDeliveryPerson] = useState(initial?.deliveredBy ?? "");
  const [notes, setNotes] = useState(initial?.description ?? "");
  const initialReceivedAt = initial?.receivedAt ? new Date(initial.receivedAt) : new Date();
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

  const [quickProviderOpen, setQuickProviderOpen] = useState(false);
  /** Line index that triggered the quick-create-location dialog, or null. */
  const [quickLocationLineIdx, setQuickLocationLineIdx] = useState<number | null>(null);
  const [quickItemLineIdx, setQuickItemLineIdx] = useState<number | null>(null);
  const [chooseKhoOpen, setChooseKhoOpen] = useState(false);
  const [storageCache, setStorageCache] = useState<
    Array<{ id: string; name: string; branchId: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<
          PaginatedResponse<{ id: string; name: string; branchId: string }>
        >("/inventory/storages?page=1&pageSize=200");
        if (!cancelled) setStorageCache(data.data);
      } catch {
        // best-effort — quick-create location modal will show empty list
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const searchProviders = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 8;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        search: query.trim(),
      });
      const { data } = await apiClient.get<PaginatedResponse<InventoryProvider>>(
        `/inventory/providers?${params}`,
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
      const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
        `/inventory/locations?${params}`,
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
      const fetched = data.page * data.pageSize;
      return {
        items: data.data,
        hasMore: fetched < data.total,
        total: data.total,
      };
    },
    [],
  );

  const summaryLines = getPersistableFormLines(lines);
  const totalQty = summaryLines.reduce((s, l) => s + Number(l.orderedQuantity || 0), 0);
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
            const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
              `/inventory/locations?page=1&pageSize=50&storageId=${encodeURIComponent(l.storageId)}&includeUnassigned=true`,
            );
            const locations = data.data;
            if (!locations || locations.length === 0) {
              toast.error("Có kho chưa có vị trí nào. Vui lòng tạo ít nhất 1 vị trí trước.");
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
        providerId: providerId || undefined,
        deliveredBy: deliveryPerson || undefined,
        reason: reason || undefined,
        description: notes || undefined,
        sourceBranchId: purpose === "TRANSFER" ? sourceBranchId || undefined : undefined,
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
      if (initial && mode === "edit") {
        await apiClient.patch(`/goods-receipts/${initial.id}`, payload);
      } else {
        await apiClient.post("/goods-receipts", payload);
      }
      setDirty(false);
      toast.success(mode === "edit" ? "Đã cập nhật phiếu nhập kho." : "Đã tạo phiếu nhập kho.");
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
    { id: "prev", label: "Trước", icon: ChevronLeft, disabled: true, onClick: () => {} },
    { id: "next", label: "Sau", icon: ChevronRight, disabled: true, onClick: () => {} },
    { id: "sep1", type: "separator" },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !isView,
      onClick: () => toast.info("Chuyển sang chế độ chỉnh sửa từ thanh công cụ chính."),
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
      disabled: !onApprove || initial?.status !== "DRAFT",
      onClick: () => onApprove?.(),
    },
    { id: "sep2", type: "separator" },
    { id: "print", label: "In", icon: Printer, disabled: true, onClick: () => {} },
    { id: "export", label: "Xuất khẩu", icon: CloudUpload, disabled: true, onClick: () => {} },
    { id: "help", label: "Trợ giúp", icon: HelpCircle, onClick: () => {} },
    { id: "close", label: "Đóng", icon: X, onClick: requestClose },
  ];

  const lineColumns: LineColumn<FormLine>[] = [
    {
      key: "itemLabel",
      label: "Mã SKU",
      width: 220,
      placeholder: "Tìm mã hoặc tên",
      renderEditor: (row, idx) => (
        <LookupField
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn hàng hóa"
          searchModalPlaceholder="Nhập mã SKU hoặc tên hàng hóa"
          dropdownMinWidth={520}
          placeholder="Tìm mã hoặc tên"
          value={row.itemLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) => (i === idx ? { ...l, itemLabel: val, itemId: "" } : l)),
            );
            markDirty();
          }}
          onSelect={(item) => {
            const defaultUnitPrice = Number(item.purchasePrice ?? 0) || 0;
            setLines((prev) =>
              normalizeFormLines(
                prev.map((l, i) => {
                  if (i !== idx) return l;
                  // A fresh line inherits the warehouse of the nearest line above it.
                  let storageId = l.storageId;
                  let storageLabel = l.storageLabel;
                  if (!storageId) {
                    for (let j = i - 1; j >= 0; j--) {
                      if (prev[j].storageId) {
                        storageId = prev[j].storageId;
                        storageLabel = prev[j].storageLabel;
                        break;
                      }
                    }
                  }
                  return {
                    ...l,
                    itemId: item.id,
                    itemLabel: item.code,
                    unit: item.unit,
                    storageId,
                    storageLabel,
                    // Only overwrite if current price is 0 — preserve user's manual edits.
                    unitPrice: l.unitPrice > 0 ? l.unitPrice : defaultUnitPrice,
                  };
                }),
              ),
            );
            markDirty();
          }}
          search={searchItems}
          itemKey={(item) => item.id}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.code} · ${item.unit}`}
          columns={[
            { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (it) => it.code },
            { key: "name", label: "Tên hàng hóa", render: (it) => it.name },
            { key: "unit", label: "ĐVT", className: "w-[80px]", render: (it) => it.unit },
          ]}
          disabled={isView}
          onCreateNew={isView ? undefined : () => setQuickItemLineIdx(idx)}
          className="h-full"
        />
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 220,
      type: "readonly",
      getValue: (row) => row.itemLabel,
    },
    {
      key: "warehouse",
      label: "Kho",
      width: 160,
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
                i === idx ? { ...l, storageLabel: val, storageId: "" } : l,
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
            markDirty();
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
      width: 160,
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
          search={(q, p, ps) => searchLocationsForStorage(row.storageId, q, p, ps)}
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          columns={[
            { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (l) => l.code },
            { key: "name", label: "Tên vị trí", render: (l) => l.name },
          ]}
          disabled={isView || !row.storageId}
          onCreateNew={
            isView || !row.storageId ? undefined : () => setQuickLocationLineIdx(idx)
          }
          className="h-full"
        />
      ),
    },
    { key: "unit", label: "Đơn vị tính", width: 90, type: "readonly", getValue: (r) => r.unit || "Đôi" },
    {
      key: "orderedQuantity",
      label: "Số lượng",
      width: 100,
      type: "number",
      align: "right",
      filterSymbol: "≤",
    },
    {
      key: "unitPrice",
      label: "Đơn giá",
      width: 120,
      align: "right",
      filterSymbol: "≤",
      renderEditor: (row, idx) => (
        <MoneyInput
          className="h-full w-full rounded-none border-0 bg-transparent px-1 text-right shadow-none"
          value={row.unitPrice === 0 ? "" : row.unitPrice}
          onChange={(v) => {
            setLines((prev) =>
              prev.map((l, i) => (i === idx ? { ...l, unitPrice: v === "" ? 0 : Number(v) } : l)),
            );
            markDirty();
          }}
        />
      ),
    },
    {
      key: "lineTotal",
      label: "Thành tiền",
      width: 130,
      type: "readonly",
      align: "right",
      filterSymbol: "≤",
      getValue: (r) => formatMoneyInteger(Number(r.orderedQuantity) * Number(r.unitPrice)),
    },
    { key: "notes", label: "Ghi chú", width: 160 },
  ];

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
        title={mode === "create" ? "Thêm mới phiếu nhập kho" : `Phiếu nhập kho ${initial?.documentNumber ?? ""}`}
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
                      setNotes(`Nhập kho hàng hóa điều chuyển từ cửa hàng ${b.name}`);
                      markDirty();
                    }}
                    search={searchBranches}
                    itemKey={(b) => b.id}
                    renderItem={(b) => b.name}
                    renderMeta={(b) => b.address ?? ""}
                    columns={[
                      { key: "name", label: "Tên cửa hàng", render: (b) => b.name },
                      { key: "address", label: "Địa chỉ", render: (b) => b.address ?? "—" },
                    ]}
                    disabled={isView}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
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
                <LookupField
                  enableSearchModal
                  searchModalTitle="Chọn đối tượng"
                  searchModalPlaceholder="Nhập mã hoặc tên nhà cung cấp"
                  className="w-[180px]"
                  dropdownMinWidth={500}
                  value={providerCode}
                  onValueChange={(v) => {
                    setProviderCode(v);
                    setProviderId("");
                    setProviderName("");
                    markDirty();
                  }}
                  onSelect={(p) => {
                    setProviderId(p.id);
                    setProviderCode(p.code);
                    setProviderName(p.name);
                    markDirty();
                  }}
                  search={searchProviders}
                  itemKey={(p) => p.id}
                  renderItem={(p) => p.name}
                  renderMeta={(p) => p.code}
                  columns={[
                    { key: "code", label: "Mã", className: "w-[160px] font-mono", render: (p) => p.code },
                    { key: "name", label: "Tên", render: (p) => p.name },
                  ]}
                  disabled={isView}
                  onCreateNew={isView ? undefined : () => setQuickProviderOpen(true)}
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
              <span className="text-sm text-muted-foreground">—</span>
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
                title={initial?.documentNumber ? undefined : "Số dự kiến — hệ thống sẽ chốt khi lưu"}
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
            <button type="button" className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover">
              Nhập khẩu
            </button>
          </>
        }
        detail={
          <LineItemGrid
            columns={lineColumns}
            rows={lines}
            onChangeCell={(idx, key, value) => {
              setLines((prev) =>
                prev.map((l, i) =>
                  i === idx ? { ...l, [key]: value } : l,
                ),
              );
              markDirty();
            }}
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
            showAddRow={!isView}
            showRowActions={!isView}
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
                Thành tiền: <strong className="ml-1">{formatMoneyInteger(totalAmount)}</strong>
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
              i === idx ? { ...l, locationId: loc.id, locationLabel: loc.code } : l,
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
                  ? { ...l, itemId: item.id, itemLabel: item.code, unit: item.unit }
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}
