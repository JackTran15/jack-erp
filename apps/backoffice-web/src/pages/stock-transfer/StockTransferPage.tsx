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
import { InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import { buildV2Body, type V2SearchConfig } from "../../components/crud/crudV2Search";

type TransferStatus = "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

const STATUS_LABEL: Record<TransferStatus, string> = {
  DRAFT: "Nháp",
  APPROVED: "Đã duyệt",
  POSTED: "Đã chuyển",
  CANCELLED: "Đã huỷ",
};

/** Filter keys align 1:1 with the `StockTransferSearchV2Dto` body fields. */
const FILTER_KEYS = [
  "date",
  "documentNumber",
  "status",
  "sourceLocation",
  "destinationLocation",
  "notes",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

const ST_SEARCH: V2SearchConfig = {
  path: "/v2/inventory/stock/transfers/search",
  fields: {
    documentNumber: "string",
    status: "enum",
    sourceLocation: "string",
    destinationLocation: "string",
    notes: "string",
    date: "date-range",
  },
};

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce((acc, k) => {
    acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
    return acc;
  }, {} as Record<FilterKey, ColumnFilter>);
}

interface TransferLine {
  id?: string;
  itemId: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  quantity: number;
  notes?: string;
}

interface Transfer {
  id: string;
  documentNumber?: string;
  status: TransferStatus;
  sourceLocationId: string;
  destinationLocationId: string;
  /** Tên vị trí xuất/nhập do endpoint v2 join sẵn (null nếu vị trí đã bị xoá). */
  sourceLocationName?: string | null;
  destinationLocationName?: string | null;
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
}

export function StockTransferPage() {
  const [records, setRecords] = useState<PaginatedResponse<Transfer> | null>(null);
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
  const [editing, setEditing] = useState<Transfer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Transfer | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const body = buildV2Body(
        ST_SEARCH,
        columnFilters as unknown as Record<string, ColumnFilter>,
        pagination.page,
        pagination.pageSize,
      );
      const { data } = await apiClient.post<{
        data: Transfer[];
        total: number;
        page: number;
        limit: number;
      }>("/v2/inventory/stock/transfers/search", body);
      setRecords({
        data: data.data,
        total: data.total,
        page: data.page,
        pageSize: data.limit,
      });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [pagination, columnFilters]);

  useEffect(() => {
    // Debounce so rapid filter typing settles into a single request.
    const t = setTimeout(() => void loadRecords(), 300);
    return () => clearTimeout(t);
  }, [loadRecords]);

  const selected = useMemo(
    () => records?.data.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  );

  const handleApprove = async (t: Transfer) => {
    setActionLoading(t.id);
    try {
      await apiClient.post(`/inventory/stock/transfers/${t.id}/approve`);
      toast.success(`Đã duyệt ${t.documentNumber ?? t.id.slice(0, 8)}.`);
      await loadRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePost = async (t: Transfer) => {
    setActionLoading(t.id);
    try {
      await apiClient.post(`/inventory/stock/transfers/${t.id}/post`);
      toast.success(`Đã chuyển ${t.documentNumber ?? t.id.slice(0, 8)}.`);
      await loadRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

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
      id: "approve",
      label: "Duyệt",
      icon: Save,
      disabled: !selected || selected.status !== "DRAFT",
      onClick: () => selected && void handleApprove(selected),
    },
    {
      id: "post",
      label: "Chuyển kho",
      icon: Save,
      disabled: !selected || selected.status !== "APPROVED",
      onClick: () => selected && void handlePost(selected),
    },
    {
      id: "delete",
      label: "Huỷ",
      icon: Trash2,
      variant: "danger",
      disabled:
        !selected ||
        (selected.status !== "DRAFT" && selected.status !== "APPROVED"),
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
      filterKind: "date-range",
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
      filterKind: "select",
      filterOptions: (Object.keys(STATUS_LABEL) as TransferStatus[]).map(
        (value) => ({ value, label: STATUS_LABEL[value] }),
      ),
      render: (row) => STATUS_LABEL[row.status],
    },
    {
      key: "sourceLocation",
      label: "Vị trí xuất",
      width: 160,
      render: (row) => row.sourceLocationName ?? "—",
    },
    {
      key: "destinationLocation",
      label: "Vị trí nhập",
      width: 160,
      render: (row) => row.destinationLocationName ?? "—",
    },
    {
      key: "lineCount",
      label: "Số dòng",
      width: 90,
      filterKind: "none",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => row.lines?.length ?? 0,
    },
    {
      key: "totalQuantity",
      label: "Tổng số lượng",
      width: 130,
      filterKind: "none",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) =>
        (row.lines ?? []).reduce((s, l) => s + Number(l.quantity), 0).toLocaleString("vi-VN"),
    },
    {
      key: "notes",
      label: "Diễn giải",
      render: (row) => row.notes ?? "",
    },
  ];

  // Any filter edit resets to page 1 so the server result starts from the top.
  const resetPage = useCallback(
    () => setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 })),
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

  return (
    <>
      <DocumentListShell
        title="Chuyển kho"
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
          columnFilterControl={columnFilterControl}
        />
      </DocumentListShell>

      {dialogMode && (
        <TransferFormDialog
          mode={dialogMode}
          initial={editing}
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
          title="Huỷ phiếu chuyển kho"
          message={`Xác nhận huỷ phiếu ${confirmDelete.documentNumber ?? confirmDelete.id.slice(0, 8)}?`}
          confirmLabel="Huỷ phiếu"
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
  unit: "",
  sourceLocationId: "",
  sourceLocationLabel: "",
  destLocationId: "",
  destLocationLabel: "",
  quantity: 1,
  notes: "",
});

function TransferFormDialog({
  mode,
  initial,
  actionLoading,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit" | "view";
  initial: Transfer | null;
  actionLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const isView = mode === "view";

  const [sourceLocationId, setSourceLocationId] = useState(
    initial?.sourceLocationId ?? "",
  );
  const [destLocationId, setDestLocationId] = useState(
    initial?.destinationLocationId ?? "",
  );
  const [sourceLocationLabel, setSourceLocationLabel] = useState("");
  const [destLocationLabel, setDestLocationLabel] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [docDate, setDocDate] = useState(
    initial ? initial.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [docTime, setDocTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [lines, setLines] = useState<FormLine[]>(() =>
    initial && initial.lines.length > 0
      ? initial.lines.map((l) => ({
          itemId: l.itemId,
          itemLabel: l.itemId.slice(0, 8),
          unit: "",
          sourceLocationId: l.sourceLocationId ?? initial.sourceLocationId,
          sourceLocationLabel: "",
          destLocationId: l.destinationLocationId ?? initial.destinationLocationId,
          destLocationLabel: "",
          quantity: Number(l.quantity),
          notes: l.notes ?? "",
        }))
      : [emptyLine()],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const searchItems = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "8" });
    if (query.trim()) params.set("search", query.trim());
    const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>(
      `/inventory/items?${params}`,
    );
    return data.data;
  }, []);

  const searchLocations = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "8" });
    if (query.trim()) params.set("search", query.trim());
    const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
      `/inventory/locations?${params}`,
    );
    return data.data;
  }, []);

  const totalQty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);

  const handleSave = useCallback(async () => {
    if (!sourceLocationId || !destLocationId) {
      setError("Vui lòng chọn vị trí xuất và vị trí nhập mặc định.");
      return;
    }
    if (lines.some((l) => !l.itemId)) {
      setError("Vui lòng chọn mặt hàng cho mọi dòng.");
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
        lines: lines.map((l) => ({
          itemId: l.itemId,
          sourceLocationId: l.sourceLocationId || sourceLocationId,
          destinationLocationId: l.destLocationId || destLocationId,
          quantity: Number(l.quantity),
          notes: l.notes || undefined,
        })),
      };
      if (initial && mode === "edit") {
        // No PATCH endpoint in current API — for now create new
        await apiClient.post("/inventory/stock/transfers", payload);
      } else {
        await apiClient.post("/inventory/stock/transfers", payload);
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
                  ? { ...l, itemId: item.id, itemLabel: item.code, unit: item.unit }
                  : l,
              ),
            );
            markDirty();
          }}
          search={searchItems}
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
      getValue: (r) => r.itemLabel,
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
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          disabled={isView}
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
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          disabled={isView}
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
            <FieldRow label="Vị trí xuất *">
              <LookupField
                placeholder="Chọn vị trí xuất mặc định"
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
                itemKey={(loc) => loc.id}
                renderItem={(loc) => loc.name}
                renderMeta={(loc) => loc.code}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Vị trí nhập *">
              <LookupField
                placeholder="Chọn vị trí nhập mặc định"
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
                itemKey={(loc) => loc.id}
                renderItem={(loc) => loc.name}
                renderMeta={(loc) => loc.code}
                disabled={isView}
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
                placeholder={initial ? undefined : "Hệ thống tự sinh khi duyệt"}
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
              if (lines.length === 1) {
                setLines([emptyLine()]);
              } else {
                setLines((prev) => prev.filter((_, i) => i !== idx));
              }
              markDirty();
            }}
            onAddRow={() => {
              setLines((prev) => [...prev, emptyLine()]);
              markDirty();
            }}
          />
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
