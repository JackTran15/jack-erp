import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppModal,
  Button,
  DocumentFormDialog,
  DocumentListShell,
  formatMoneyInteger,
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
  Eye,
  HelpCircle,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
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
  DEFAULT_PAGINATION,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  ensureTrailingBlankLine,
  getPersistableLines,
} from "../inventory-line-normalization";

type TransferStatus = "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

// MISA collapses the lifecycle into three outcomes. APPROVED is retained in the
// API enum but unreachable; it maps to the not-yet-done bucket defensively.
const STATUS_LABEL: Record<TransferStatus, string> = {
  DRAFT: "Chưa thực hiện",
  APPROVED: "Chưa thực hiện",
  POSTED: "Đã thực hiện",
  CANCELLED: "Đã hủy",
};

function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

interface TransferLine {
  id?: string;
  itemId: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  quantity: number;
  notes?: string;
  item?: { id: string; code: string; name: string; unit?: string } | null;
  sourceLocation?: { id: string; code: string; name: string } | null;
  destinationLocation?: { id: string; code: string; name: string } | null;
}

interface Transfer {
  id: string;
  documentNumber?: string;
  status: TransferStatus;
  sourceLocationId: string;
  destinationLocationId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string;
  lines: TransferLine[];
  createdAt: string;
  approvedAt?: string;
  postedAt?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  storageId: string;
  branchId: string;
}

interface InventoryStorage {
  id: string;
  name: string;
  branchId: string;
  isMainStorage?: boolean;
}

export function StockTransferPage() {
  const [records, setRecords] = useState<PaginatedResponse<Transfer> | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [storages, setStorages] = useState<InventoryStorage[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [editing, setEditing] = useState<Transfer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Transfer | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const { data } = await apiClient.get<PaginatedResponse<Transfer>>(
        `/inventory/stock/transfers?${params}`,
      );
      setRecords(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [pagination]);

  const loadStorages = useCallback(async () => {
    try {
      const branchId = getActiveBranchId();
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (branchId) params.set("branchId", branchId);
      const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
        `/inventory/storages?${params}`,
      );
      setStorages(data.data);
    } catch {
      // best-effort; the Kho selector falls back to an empty list
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  const selected = useMemo(
    () => records?.data.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  );

  const handleCancel = async (t: Transfer) => {
    setActionLoading(t.id);
    try {
      await apiClient.post(`/inventory/stock/transfers/${t.id}/cancel`);
      setConfirmDelete(null);
      if (selectedId === t.id) setSelectedId(null);
      await loadRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Thêm mới",
      icon: Plus,
      onClick: () => {
        setEditing(null);
        setDialogMode("create");
      },
    },
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selected,
      onClick: () => {
        if (!selected) return;
        setEditing(selected);
        setDialogMode("view");
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !selected || selected.status !== "DRAFT",
      onClick: () => {
        if (!selected) return;
        setEditing(selected);
        setDialogMode("edit");
      },
    },
    {
      id: "cancel",
      label: "Hoãn",
      icon: RotateCcw,
      variant: "danger",
      // Voids a draft (and would reverse a posted doc once a reversal path
      // exists). Never wired to approve/post.
      disabled: !selected || selected.status !== "DRAFT",
      onClick: () => selected && setConfirmDelete(selected),
    },
    { id: "sep1", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: () => void loadRecords() },
  ];

  const columns: TableColumn<Transfer>[] = [
    {
      key: "date",
      label: "Ngày",
      width: 110,
      render: (row) => new Date(row.createdAt).toLocaleDateString("vi-VN"),
    },
    {
      key: "documentNumber",
      label: "Số phiếu chuyển",
      width: 160,
      render: (row) =>
        row.documentNumber ? (
          <span className="font-medium">{row.documentNumber}</span>
        ) : (
          <span className="italic text-muted-foreground">Chưa cấp số</span>
        ),
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 140,
      render: (row) => STATUS_LABEL[row.status],
    },
    {
      key: "lineCount",
      label: "Số dòng",
      width: 90,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => row.lines.length,
    },
    {
      key: "totalQuantity",
      label: "Tổng số lượng",
      width: 130,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) =>
        row.lines.reduce((s, l) => s + Number(l.quantity), 0).toLocaleString("vi-VN"),
    },
    {
      key: "notes",
      label: "Diễn giải",
      render: (row) => row.notes ?? "",
    },
  ];

  return (
    <>
      <DocumentListShell
        title={<InventoryPageTitle>Chuyển kho</InventoryPageTitle>}
        tabs={<InventoryTabBar activeId="stock-transfer" />}
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
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
            onPageSizeChange={(s) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))
            }
            onRefresh={() => void loadRecords()}
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={records?.data ?? []}
          loading={loading}
          emptyLabel="Chưa có phiếu chuyển kho."
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
        />
      </DocumentListShell>

      {dialogMode && (
        <TransferFormDialog
          mode={dialogMode}
          initial={editing}
          storages={storages}
          actionLoading={!!actionLoading}
          onClose={() => {
            setDialogMode(null);
            setEditing(null);
          }}
          onSaved={async () => {
            setDialogMode(null);
            setEditing(null);
            await loadRecords();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmActionModal
          title="Hoãn phiếu chuyển kho"
          message={`Xác nhận hoãn phiếu ${confirmDelete.documentNumber ?? confirmDelete.id.slice(0, 8)}?`}
          confirmLabel="Hoãn phiếu"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleCancel(confirmDelete)}
        />
      )}
    </>
  );
}

// ─── Form dialog ─────────────────────────────────────────────────────────────

interface FormLine {
  itemId: string;
  itemLabel: string;
  itemName: string;
  unit: string;
  sourceLocationId: string;
  sourceLocationLabel: string;
  destLocationId: string;
  destLocationLabel: string;
  quantity: number;
  notes: string;
}

const emptyLine = (): FormLine => ({
  itemId: "",
  itemLabel: "",
  itemName: "",
  unit: "",
  sourceLocationId: "",
  sourceLocationLabel: "",
  destLocationId: "",
  destLocationLabel: "",
  quantity: 1,
  notes: "",
});

const getPersistableFormLines = (nextLines: FormLine[]) =>
  getPersistableLines(nextLines);

const normalizeFormLines = (nextLines: FormLine[]) =>
  ensureTrailingBlankLine(nextLines, emptyLine);

function TransferFormDialog({
  mode,
  initial,
  storages,
  actionLoading,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit" | "view";
  initial: Transfer | null;
  storages: InventoryStorage[];
  actionLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const isView = mode === "view";

  // Default a new phiếu to the active branch's main storage (list is main-first).
  // For edit/view, the header location labels are resolved from the eager
  // relations on the loaded lines, so the Kho field stays blank.
  const defaultStorage = useMemo(
    () => storages.find((s) => s.isMainStorage) ?? storages[0],
    [storages],
  );
  const [storageId, setStorageId] = useState(initial ? "" : defaultStorage?.id ?? "");
  const [storageQuery, setStorageQuery] = useState(
    initial ? "" : defaultStorage?.name ?? "",
  );

  const headerSourceLoc = initial?.lines.find((l) => l.sourceLocation)?.sourceLocation;
  const headerDestLoc = initial?.lines.find((l) => l.destinationLocation)
    ?.destinationLocation;

  const [sourceLocationId, setSourceLocationId] = useState(
    initial?.sourceLocationId ?? "",
  );
  const [destLocationId, setDestLocationId] = useState(
    initial?.destinationLocationId ?? "",
  );
  const [sourceLocationLabel, setSourceLocationLabel] = useState(
    headerSourceLoc ? `${headerSourceLoc.code} · ${headerSourceLoc.name}` : "",
  );
  const [destLocationLabel, setDestLocationLabel] = useState(
    headerDestLoc ? `${headerDestLoc.code} · ${headerDestLoc.name}` : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [docDate, setDocDate] = useState(
    initial ? initial.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [docTime, setDocTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [lines, setLines] = useState<FormLine[]>(() => {
    if (!initial) return [emptyLine()];
    if (initial.lines.length === 0) return isView ? [] : [emptyLine()];

    const initialLines = initial.lines.map((l) => ({
          itemId: l.itemId,
          itemLabel: l.item?.code ?? l.itemId.slice(0, 8),
          itemName: l.item?.name ?? "",
          unit: l.item?.unit ?? "",
          sourceLocationId: l.sourceLocationId ?? initial.sourceLocationId,
          sourceLocationLabel: l.sourceLocation
            ? `${l.sourceLocation.code} · ${l.sourceLocation.name}`
            : "",
          destLocationId: l.destinationLocationId ?? initial.destinationLocationId,
          destLocationLabel: l.destinationLocation
            ? `${l.destinationLocation.code} · ${l.destinationLocation.name}`
            : "",
          quantity: Number(l.quantity),
          notes: l.notes ?? "",
        }));

    return isView ? initialLines : normalizeFormLines(initialLines);
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const searchItems = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 20;
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

  // Locations are scoped to the selected Kho when one is chosen. Without a
  // storage the search returns nothing so the user picks a Kho first.
  const searchLocations = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
      });
      if (query.trim()) params.set("search", query.trim());
      if (storageId) params.set("storageId", storageId);
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
    [storageId],
  );

  // Kho picker is fed from the page-level cached storages (already scoped to
  // the active branch), filtered/paged client-side.
  const searchStorages = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? storages.filter((s) => s.name.toLowerCase().includes(q))
        : storages;
      const effectivePageSize = pageSize ?? 20;
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

  const summaryLines = getPersistableFormLines(lines);
  const totalQty = summaryLines.reduce((s, l) => s + Number(l.quantity || 0), 0);

  const handleSave = useCallback(async () => {
    if (!sourceLocationId || !destLocationId) {
      setError("Vui lòng chọn vị trí xuất và vị trí nhập mặc định.");
      return;
    }
    const persistableLines = getPersistableFormLines(lines);
    if (persistableLines.length === 0) {
      setError("Cần ít nhất 1 dòng hàng hợp lệ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Find branchIds from default locations (load lazily)
      const [{ data: srcLoc }, { data: dstLoc }] = await Promise.all([
        apiClient.get<InventoryLocation>(`/inventory/locations/${sourceLocationId}`),
        apiClient.get<InventoryLocation>(`/inventory/locations/${destLocationId}`),
      ]);
      const payload = {
        sourceLocationId,
        destinationLocationId: destLocationId,
        sourceBranchId: srcLoc.branchId,
        destinationBranchId: dstLoc.branchId,
        notes: notes || undefined,
        lines: persistableLines.map((l) => ({
          itemId: l.itemId,
          sourceLocationId: l.sourceLocationId || sourceLocationId,
          destinationLocationId: l.destLocationId || destLocationId,
          quantity: Number(l.quantity),
          notes: l.notes || undefined,
        })),
      };
      if (initial && mode === "edit") {
        await apiClient.patch(`/inventory/stock/transfers/${initial.id}`, payload);
        toast.success("Đã cập nhật phiếu chuyển kho.");
      } else {
        // "Lưu" creates and posts atomically — the phiếu lands "Đã thực hiện"
        // (Số phiếu + ghi sổ kho) ngay, hiển thị trong báo cáo lập tức.
        await apiClient.post("/inventory/stock/transfers", payload);
        toast.success("Đã lưu và chuyển kho.");
      }
      setDirty(false);
      await onSaved();
    } catch (err) {
      setError(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [sourceLocationId, destLocationId, lines, notes, initial, mode, onSaved]);

  const requestClose = () => {
    if (dirtyRef.current && !isView) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  };

  const handleUnsavedChoice = async (choice: UnsavedChangesChoice) => {
    if (choice === "save") {
      await handleSave();
      onClose();
    } else if (choice === "discard") {
      onClose();
    }
  };

  const dialogToolbar: ToolbarItem[] = [
    { id: "prev", label: "Trước", icon: ChevronLeft, disabled: true, onClick: () => {} },
    { id: "next", label: "Sau", icon: ChevronRight, disabled: true, onClick: () => {} },
    { id: "sep1", type: "separator" },
    {
      id: "new",
      label: "Thêm mới",
      icon: Plus,
      onClick: () => {
        setSourceLocationId("");
        setSourceLocationLabel("");
        setDestLocationId("");
        setDestLocationLabel("");
        setNotes("");
        setLines([emptyLine()]);
        setDirty(false);
        setError(null);
      },
    },
    {
      id: "save",
      label: "Lưu",
      icon: Save,
      disabled: isView || saving,
      onClick: () => void handleSave(),
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
      renderEditor: (row, idx) => (
        <LookupField
          placeholder="Tìm mã/tên"
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
            );
            markDirty();
          }}
          search={searchItems}
          enableSearchModal
          searchModalTitle="Chọn mặt hàng"
          searchModalPlaceholder="Nhập mã hoặc tên mặt hàng"
          itemKey={(it) => it.id}
          renderItem={(it) => it.name}
          renderMeta={(it) => `${it.code} · ${it.unit}`}
          columns={[
            { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (it) => it.code },
            { key: "name", label: "Tên", render: (it) => it.name },
            { key: "unit", label: "ĐVT", className: "w-[60px]", render: (it) => it.unit },
          ]}
          disabled={isView}
          className="h-full"
        />
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 200,
      type: "readonly",
      getValue: (r) => r.itemName,
    },
    {
      key: "sourceLocationLabel",
      label: "Vị trí xuất",
      width: 160,
      renderEditor: (row, idx) => (
        <LookupField
          placeholder="Mặc định"
          value={row.sourceLocationLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, sourceLocationLabel: val, sourceLocationId: "" }
                  : l,
              ),
            );
            markDirty();
          }}
          onSelect={(loc) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      sourceLocationId: loc.id,
                      sourceLocationLabel: `${loc.code} · ${loc.name}`,
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          search={searchLocations}
          enableSearchModal
          searchModalTitle="Chọn vị trí xuất"
          searchModalPlaceholder="Nhập mã/tên vị trí"
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          disabled={isView || !storageId}
          className="h-full"
        />
      ),
    },
    {
      key: "destLocationLabel",
      label: "Vị trí nhập",
      width: 160,
      renderEditor: (row, idx) => (
        <LookupField
          placeholder="Mặc định"
          value={row.destLocationLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, destLocationLabel: val, destLocationId: "" }
                  : l,
              ),
            );
            markDirty();
          }}
          onSelect={(loc) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      destLocationId: loc.id,
                      destLocationLabel: `${loc.code} · ${loc.name}`,
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          search={searchLocations}
          enableSearchModal
          searchModalTitle="Chọn vị trí nhập"
          searchModalPlaceholder="Nhập mã/tên vị trí"
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          disabled={isView || !storageId}
          className="h-full"
        />
      ),
    },
    { key: "unit", label: "ĐVT", width: 70, type: "readonly", getValue: (r) => r.unit || "—" },
    {
      key: "quantity",
      label: "Số lượng",
      width: 100,
      type: "number",
      align: "right",
      filterSymbol: "≤",
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
        title={mode === "create" ? "Thêm mới phiếu chuyển kho" : `Phiếu chuyển kho ${initial?.documentNumber ?? ""}`}
        toolbarItems={dialogToolbar}
        generalInfo={
          <>
            <FieldRow label="Kho">
              <LookupField
                enableSearchModal
                searchModalTitle="Chọn kho"
                searchModalPlaceholder="Nhập tên kho"
                placeholder="Chọn kho"
                value={storageQuery}
                onValueChange={(v) => {
                  setStorageQuery(v);
                  setStorageId("");
                  markDirty();
                }}
                onSelect={(s) => {
                  setStorageId(s.id);
                  setStorageQuery(s.name);
                  // Locations are storage-scoped — clear any picks from the
                  // previous Kho so they cannot leak across warehouses.
                  setSourceLocationId("");
                  setSourceLocationLabel("");
                  setDestLocationId("");
                  setDestLocationLabel("");
                  setLines((prev) =>
                    prev.map((l) => ({
                      ...l,
                      sourceLocationId: "",
                      sourceLocationLabel: "",
                      destLocationId: "",
                      destLocationLabel: "",
                    })),
                  );
                  markDirty();
                }}
                search={searchStorages}
                itemKey={(s) => s.id}
                renderItem={(s) => s.name}
                renderMeta={() => ""}
                columns={[{ key: "name", label: "Tên kho", render: (s) => s.name }]}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Vị trí xuất *">
              <LookupField
                placeholder={storageId ? "Chọn vị trí xuất mặc định" : "Chọn kho trước"}
                value={sourceLocationLabel}
                onValueChange={(v) => {
                  setSourceLocationLabel(v);
                  setSourceLocationId("");
                  markDirty();
                }}
                onSelect={(loc) => {
                  setSourceLocationId(loc.id);
                  setSourceLocationLabel(`${loc.code} · ${loc.name}`);
                  markDirty();
                }}
                search={searchLocations}
                enableSearchModal
                searchModalTitle="Chọn vị trí xuất"
                searchModalPlaceholder="Nhập mã/tên vị trí"
                itemKey={(loc) => loc.id}
                renderItem={(loc) => loc.name}
                renderMeta={(loc) => loc.code}
                disabled={isView || !storageId}
              />
            </FieldRow>
            <FieldRow label="Vị trí nhập *">
              <LookupField
                placeholder={storageId ? "Chọn vị trí nhập mặc định" : "Chọn kho trước"}
                value={destLocationLabel}
                onValueChange={(v) => {
                  setDestLocationLabel(v);
                  setDestLocationId("");
                  markDirty();
                }}
                onSelect={(loc) => {
                  setDestLocationId(loc.id);
                  setDestLocationLabel(`${loc.code} · ${loc.name}`);
                  markDirty();
                }}
                search={searchLocations}
                enableSearchModal
                searchModalTitle="Chọn vị trí nhập"
                searchModalPlaceholder="Nhập mã/tên vị trí"
                itemKey={(loc) => loc.id}
                renderItem={(loc) => loc.name}
                renderMeta={(loc) => loc.code}
                disabled={isView || !storageId}
              />
            </FieldRow>
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
          </>
        }
        documentInfo={
          <>
            <FieldRow label="Số phiếu chuyển">
              <Input
                value={initial?.documentNumber ?? ""}
                readOnly
                placeholder={initial ? undefined : "Hệ thống tự sinh khi lưu"}
              />
            </FieldRow>
            <FieldRow label="Ngày chuyển">
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
            <FieldRow label="Giờ chuyển">
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
            onDeleteRow={(idx) => {
              setLines((prev) =>
                normalizeFormLines(prev.filter((_, i) => i !== idx)),
              );
              markDirty();
            }}
            onAddRow={() => {
              setLines((prev) => normalizeFormLines([...prev, emptyLine()]));
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

      {error && (
        <AppModal open onOpenChange={() => setError(null)} title="Lỗi" defaultWidth={420} defaultHeight={220}>
          <p className="text-sm text-destructive">{error}</p>
        </AppModal>
      )}

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
