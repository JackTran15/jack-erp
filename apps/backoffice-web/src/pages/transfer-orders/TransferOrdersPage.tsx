import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  DocumentFormDialog,
  DocumentListShell,
  Input,
  LineItemGrid,
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
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { LookupField } from "../../components/forms/LookupField";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
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

type TOStatus = "DRAFT" | "APPROVED" | "EXECUTED" | "CANCELLED";

// Misa lumps DRAFT and APPROVED into "Chưa thực hiện" — internal granularity
// is preserved on the row, but users only see two outcomes: not-yet vs done.
const STATUS_LABEL: Record<TOStatus, string> = {
  DRAFT: "Chưa thực hiện",
  APPROVED: "Chưa thực hiện",
  EXECUTED: "Đã thực hiện",
  CANCELLED: "Đã hủy",
};

interface TransferOrderLine {
  id: string;
  itemId: string;
  requestedQty: string | number;
  note?: string | null;
  item?: { id: string; code: string; name: string; unit?: string } | null;
}

interface TransferOrder {
  id: string;
  documentNumber?: string | null;
  status: TOStatus;
  sourceBranchId: string;
  destinationBranchId: string;
  sourceStorageId?: string | null;
  destinationStorageId?: string | null;
  requestedDate?: string | null;
  notes?: string | null;
  lines: TransferOrderLine[];
  createdAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface BranchOption {
  id: string;
  name: string;
  address?: string | null;
}

interface InventoryStorage {
  id: string;
  name: string;
  branchId: string;
}

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}

const FILTER_KEYS = [
  "date",
  "documentNumber",
  "notes",
  "destinationBranch",
  "status",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce((acc, k) => {
    acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
    return acc;
  }, {} as Record<FilterKey, ColumnFilter>);
}

function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

export function TransferOrdersPage() {
  const [records, setRecords] = useState<PaginatedResponse<TransferOrder> | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [storages, setStorages] = useState<InventoryStorage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_week");
    return { preset: "this_week", ...range };
  });
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [editingOrder, setEditingOrder] = useState<TransferOrder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TransferOrder | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const { data } = await apiClient.get<PaginatedResponse<TransferOrder>>(
        `/inventory/transfer-orders?${params}`,
      );
      setRecords(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [pagination]);

  const loadBranches = useCallback(async () => {
    try {
      const { data } = await apiClient.get<PaginatedResponse<BranchOption>>(
        "/branches?page=1&pageSize=200",
      );
      setBranches(data.data);
    } catch {
      // best-effort; fall back to ID rendering in the table
    }
  }, []);

  const loadStorages = useCallback(async () => {
    try {
      const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
        "/inventory/storages?page=1&pageSize=200",
      );
      setStorages(data.data);
    } catch {
      // best-effort; storage name will display as fallback dash
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branches) map.set(b.id, b.name);
    return map;
  }, [branches]);

  const storageNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of storages) map.set(s.id, s.name);
    return map;
  }, [storages]);

  const selectedOrder = useMemo(
    () => records?.data.find((o) => o.id === selectedId) ?? null,
    [records, selectedId],
  );

  const reloadAfterMutation = useCallback(async () => {
    await loadRecords();
  }, [loadRecords]);

  const handleDelete = async (order: TransferOrder) => {
    setActionLoading(order.id);
    try {
      await apiClient.delete(`/inventory/transfer-orders/${order.id}`);
      setConfirmDelete(null);
      if (selectedId === order.id) setSelectedId(null);
      await reloadAfterMutation();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const editable = selectedOrder?.status === "DRAFT";
  const deletable =
    !!selectedOrder &&
    selectedOrder.status !== "EXECUTED" &&
    selectedOrder.status !== "CANCELLED";

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
      disabled: !selectedOrder || !editable,
      onClick: () => {
        if (!editable) {
          toast.info("Chỉ sửa được lệnh ở trạng thái Chưa thực hiện (chưa duyệt).");
          return;
        }
        toast.info("Tính năng sửa lệnh đang được cập nhật. Vui lòng nhân bản phiếu mới.");
      },
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled: !deletable,
      onClick: () => selectedOrder && setConfirmDelete(selectedOrder),
    },
    { id: "sep1", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: () => void loadRecords() },
  ];

  const columns: TableColumn<TransferOrder>[] = [
    {
      key: "date",
      label: "Ngày",
      width: 110,
      render: (row) =>
        row.requestedDate
          ? new Date(row.requestedDate).toLocaleDateString("vi-VN")
          : new Date(row.createdAt).toLocaleDateString("vi-VN"),
    },
    {
      key: "documentNumber",
      label: "Số chứng từ",
      width: 140,
      render: (row) =>
        row.documentNumber ? (
          <button
            type="button"
            className="text-primary-blue transition-colors hover:text-primary-blue-hover hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(row.id);
              setEditingOrder(row);
              setDialogMode("view");
            }}
            title={row.documentNumber}
          >
            {row.documentNumber}
          </button>
        ) : (
          <span className="italic text-muted-foreground">(chưa có số)</span>
        ),
    },
    {
      key: "notes",
      label: "Lý do",
      render: (row) => row.notes ?? "",
    },
    {
      key: "destinationBranch",
      label: "Điều chuyển đến",
      width: 200,
      render: (row) =>
        branchNameById.get(row.destinationBranchId) ??
        row.destinationBranchId.slice(0, 8),
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 140,
      render: (row) => STATUS_LABEL[row.status],
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
    return `LDC${String(max + 1).padStart(6, "0")}`;
  }, [records]);

  return (
    <>
      <DocumentListShell
        title={<InventoryPageTitle>Lệnh điều chuyển</InventoryPageTitle>}
        tabs={<InventoryTabBar activeId="transfer-order" />}
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
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: nextPageSize }))
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
          emptyLabel="Chưa có lệnh điều chuyển."
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
        <TransferOrderFormDialog
          mode={dialogMode}
          initial={editingOrder}
          branches={branches}
          storages={storages}
          previewDocumentNumber={nextDocumentNumber}
          actionLoading={!!actionLoading}
          onClose={() => {
            setDialogMode(null);
            setEditingOrder(null);
          }}
          onSaved={async () => {
            setDialogMode(null);
            setEditingOrder(null);
            await loadRecords();
          }}
          onRequestDelete={
            editingOrder && editingOrder.status !== "EXECUTED" && editingOrder.status !== "CANCELLED"
              ? () => setConfirmDelete(editingOrder)
              : undefined
          }
        />
      )}

      {confirmDelete && (
        <ConfirmActionModal
          title="Hủy lệnh điều chuyển"
          message={`Xác nhận hủy lệnh ${confirmDelete.documentNumber ?? confirmDelete.id}? Lệnh sẽ chuyển sang trạng thái Đã hủy.`}
          confirmLabel="Hủy lệnh"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDelete(confirmDelete)}
        />
      )}
    </>
  );
}

// ─── Detail panel (selected order's lines) ────────────────────────────────────

function DetailPanel({
  order,
  storageNameById,
}: {
  order: TransferOrder | null;
  storageNameById: Map<string, string>;
}) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 inline-block border-b-2 border-primary px-2 pb-1 text-sm font-semibold">
        Chi tiết
      </div>
      {!order ? (
        <p className="text-sm text-muted-foreground">
          Chọn một lệnh để xem chi tiết.
        </p>
      ) : order.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Lệnh này chưa có dòng hàng.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="border-r px-2 py-1.5 text-left font-medium">Mã SKU</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Tên hàng hóa</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Kho</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Đơn vị tính</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Số lượng</th>
              <th className="px-2 py-1.5 text-left font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => {
              const code = line.item?.code ?? line.itemId.slice(0, 8);
              const name = line.item?.name ?? "—";
              const unit = line.item?.unit ?? "—";
              const storageName = order.sourceStorageId
                ? storageNameById.get(order.sourceStorageId) ?? "—"
                : "—";
              return (
                <tr key={line.id} className="border-b">
                  <td className="border-r px-2 py-1 font-mono text-xs">{code}</td>
                  <td className="border-r px-2 py-1">{name}</td>
                  <td className="border-r px-2 py-1">{storageName}</td>
                  <td className="border-r px-2 py-1">{unit}</td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {Number(line.requestedQty).toLocaleString("vi-VN")}
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

// ─── Form dialog (create / view) ──────────────────────────────────────────────

interface FormLine {
  itemId: string;
  itemLabel: string;
  itemName: string;
  unit: string;
  requestedQty: number;
  note: string;
}

const emptyLine = (): FormLine => ({
  itemId: "",
  itemLabel: "",
  itemName: "",
  unit: "",
  requestedQty: 1,
  note: "",
});

const getPersistableFormLines = (nextLines: FormLine[]) =>
  getPersistableLines(nextLines);

const normalizeFormLines = (nextLines: FormLine[]) =>
  ensureTrailingBlankLine(nextLines, emptyLine);

function TransferOrderFormDialog({
  mode,
  initial,
  branches,
  storages,
  previewDocumentNumber,
  actionLoading,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  mode: "create" | "edit" | "view";
  initial: TransferOrder | null;
  branches: BranchOption[];
  storages: InventoryStorage[];
  previewDocumentNumber?: string;
  actionLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onRequestDelete?: () => void;
}) {
  const isView = mode === "view";

  // For Misa-style behavior: source branch defaults to the active branch
  // the user is currently scoped to, so they only need to pick destination.
  const fallbackSourceBranchId = getActiveBranchId() ?? "";
  const initialSourceBranchId = initial?.sourceBranchId ?? fallbackSourceBranchId;
  const initialSourceBranchName =
    branches.find((b) => b.id === initialSourceBranchId)?.name ?? "";
  const initialDestBranchId = initial?.destinationBranchId ?? "";
  const initialDestBranchName =
    branches.find((b) => b.id === initialDestBranchId)?.name ?? "";

  const initialSourceStorageId =
    initial?.sourceStorageId ??
    storages.find((s) => s.branchId === initialSourceBranchId)?.id ??
    "";
  const initialSourceStorageName =
    storages.find((s) => s.id === initialSourceStorageId)?.name ?? "";

  const [sourceBranchId, setSourceBranchId] = useState(initialSourceBranchId);
  const [sourceBranchLabel, setSourceBranchLabel] = useState(initialSourceBranchName);
  const [destBranchId, setDestBranchId] = useState(initialDestBranchId);
  const [destBranchLabel, setDestBranchLabel] = useState(initialDestBranchName);
  const [sourceStorageId, setSourceStorageId] = useState(initialSourceStorageId);
  const [sourceStorageLabel, setSourceStorageLabel] = useState(initialSourceStorageName);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [docDate, setDocDate] = useState(
    initial?.requestedDate ?? new Date().toISOString().slice(0, 10),
  );
  const [lines, setLines] = useState<FormLine[]>(() => {
    if (!initial) return [emptyLine()];

    const initialLines = initial.lines.map((l) => ({
          itemId: l.itemId,
          itemLabel: l.item?.code ?? l.itemId.slice(0, 8),
          itemName: l.item?.name ?? "",
          unit: l.item?.unit ?? "",
          requestedQty: Number(l.requestedQty),
          note: l.note ?? "",
        }));

    return isView ? initialLines : normalizeFormLines(initialLines);
  });

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  // When user picks a new source branch and we don't yet have a storage
  // resolved, auto-pick the first storage of that branch (Misa shows storage
  // per line without a dedicated header field, so user shouldn't have to
  // hunt for it explicitly).
  useEffect(() => {
    if (!sourceBranchId || sourceStorageId) return;
    const first = storages.find((s) => s.branchId === sourceBranchId);
    if (first) {
      setSourceStorageId(first.id);
      setSourceStorageLabel(first.name);
    }
  }, [sourceBranchId, sourceStorageId, storages]);

  // Once branches finish loading, backfill the source branch label if we
  // started with just an active_branch_id from localStorage.
  useEffect(() => {
    if (sourceBranchLabel || !sourceBranchId) return;
    const found = branches.find((b) => b.id === sourceBranchId);
    if (found) setSourceBranchLabel(found.name);
  }, [branches, sourceBranchId, sourceBranchLabel]);

  const searchBranches = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 8;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
      });
      if (query.trim()) params.set("search", query.trim());
      const { data } = await apiClient.get<PaginatedResponse<BranchOption>>(
        `/branches?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [],
  );

  const searchItems = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 10;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
      });
      if (query.trim()) params.set("search", query.trim());
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

  const summaryLines = getPersistableFormLines(lines);
  const totalQty = summaryLines.reduce((s, l) => s + Number(l.requestedQty || 0), 0);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!sourceBranchId) {
      toast.error("Vui lòng chọn chi nhánh nguồn.");
      return false;
    }
    if (!destBranchId) {
      toast.error("Vui lòng chọn chi nhánh đích.");
      return false;
    }
    if (sourceBranchId === destBranchId && !sourceStorageId) {
      toast.error("Điều chuyển nội bộ phải chọn kho nguồn cụ thể.");
      return false;
    }
    const persistableLines = getPersistableFormLines(lines);
    if (persistableLines.length === 0) {
      toast.error("Cần ít nhất 1 dòng hàng hợp lệ.");
      return false;
    }
    if (persistableLines.some((l) => Number(l.requestedQty) <= 0)) {
      toast.error("Số lượng phải lớn hơn 0.");
      return false;
    }
    setSaving(true);
    try {
      await apiClient.post("/inventory/transfer-orders", {
        sourceBranchId,
        destinationBranchId: destBranchId,
        sourceStorageId: sourceStorageId || undefined,
        requestedDate: docDate || undefined,
        notes: notes || undefined,
        lines: persistableLines.map((l) => ({
          itemId: l.itemId,
          requestedQty: Number(l.requestedQty),
          note: l.note || undefined,
        })),
      });
      setDirty(false);
      toast.success("Đã tạo lệnh điều chuyển.");
      await onSaved();
      return true;
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    sourceBranchId,
    destBranchId,
    sourceStorageId,
    docDate,
    notes,
    lines,
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
      id: "create-new",
      label: "Thêm mới",
      icon: Plus,
      disabled: mode === "create",
      onClick: () => toast.info("Đóng phiếu hiện tại trước khi tạo phiếu mới."),
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !isView || initial?.status !== "DRAFT",
      onClick: () =>
        toast.info("Tính năng sửa lệnh đang được cập nhật. Vui lòng nhân bản phiếu mới."),
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
      disabled:
        !onRequestDelete ||
        initial?.status === "EXECUTED" ||
        initial?.status === "CANCELLED",
      onClick: () => onRequestDelete?.(),
    },
    {
      id: "void",
      label: "Hoãn",
      icon: RotateCcw,
      disabled: true,
      onClick: () => {},
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
      width: 180,
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
              prev.map((l, i) =>
                i === idx ? { ...l, itemLabel: val, itemId: "" } : l,
              ),
            );
            markDirty();
          }}
          onSelect={(item) => {
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
                      }
                    : l,
                ),
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
          className="h-full"
        />
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 240,
      type: "readonly",
      getValue: (row) => row.itemName,
    },
    {
      key: "warehouse",
      label: "Kho",
      width: 180,
      type: "readonly",
      getValue: () => sourceStorageLabel,
    },
    {
      key: "unit",
      label: "Đơn vị tính",
      width: 110,
      type: "readonly",
      getValue: (row) => row.unit,
    },
    {
      key: "requestedQty",
      label: "Số lượng",
      width: 110,
      type: "number",
      align: "right",
      filterSymbol: "≤",
    },
    {
      key: "note",
      label: "Ghi chú",
      placeholder: "Nhập ghi chú",
    },
  ];

  const statusLabel = initial?.status ? STATUS_LABEL[initial.status] : "Chưa thực hiện";

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
        title={
          mode === "create"
            ? "Thêm mới lệnh điều chuyển"
            : `Lệnh điều chuyển ${initial?.documentNumber ?? ""}`
        }
        toolbarItems={dialogToolbar}
        generalInfo={
          <>
            <div className="grid grid-cols-[120px_minmax(0,1fr)_70px_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
              <label className="text-sm text-muted-foreground">Điều chuyển từ</label>
              <LookupField
                enableSearchModal
                searchModalTitle="Chọn chi nhánh nguồn"
                searchModalPlaceholder="Nhập tên chi nhánh"
                placeholder="Chọn chi nhánh nguồn"
                value={sourceBranchLabel}
                onValueChange={(v) => {
                  setSourceBranchLabel(v);
                  setSourceBranchId("");
                  setSourceStorageId("");
                  setSourceStorageLabel("");
                  markDirty();
                }}
                onSelect={(b) => {
                  setSourceBranchId(b.id);
                  setSourceBranchLabel(b.name);
                  setSourceStorageId("");
                  setSourceStorageLabel("");
                  markDirty();
                }}
                search={searchBranches}
                itemKey={(b) => b.id}
                renderItem={(b) => b.name}
                renderMeta={(b) => b.address ?? ""}
                columns={[
                  { key: "name", label: "Tên chi nhánh", render: (b) => b.name },
                  { key: "address", label: "Địa chỉ", render: (b) => b.address ?? "—" },
                ]}
                disabled={isView}
              />
              <label className="text-sm text-muted-foreground">Đến</label>
              <LookupField
                enableSearchModal
                searchModalTitle="Chọn chi nhánh đích"
                searchModalPlaceholder="Nhập tên chi nhánh"
                placeholder="Chọn chi nhánh đích"
                value={destBranchLabel}
                onValueChange={(v) => {
                  setDestBranchLabel(v);
                  setDestBranchId("");
                  markDirty();
                }}
                onSelect={(b) => {
                  setDestBranchId(b.id);
                  setDestBranchLabel(b.name);
                  markDirty();
                }}
                search={searchBranches}
                itemKey={(b) => b.id}
                renderItem={(b) => b.name}
                renderMeta={(b) => b.address ?? ""}
                columns={[
                  { key: "name", label: "Tên chi nhánh", render: (b) => b.name },
                  { key: "address", label: "Địa chỉ", render: (b) => b.address ?? "—" },
                ]}
                disabled={isView}
              />
            </div>
            <FieldRow label="Lý do">
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
            <FieldRow label="Số phiếu">
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
            <FieldRow label="Ngày chứng từ">
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
            <FieldRow label="Trạng thái">
              <Input value={statusLabel} readOnly disabled />
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
              className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover disabled:opacity-50"
              disabled
            >
              Chọn kho
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover disabled:opacity-50"
              disabled
            >
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
                prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)),
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
            <span>
              Số lượng: <strong className="ml-1">{totalQty}</strong>
            </span>
          </div>
        }
      />

      <UnsavedChangesDialog
        open={unsavedOpen}
        onOpenChange={setUnsavedOpen}
        onChoose={(c) => void handleUnsavedChoice(c)}
        saveDisabled={actionLoading || saving}
      />
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}
