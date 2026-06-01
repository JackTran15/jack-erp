import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppModal,
  Button,
  DocumentListShell,
  Input,
  PageToolbar,
  type ToolbarItem,
} from "@erp/ui";
import { LocationType } from "@erp/shared-interfaces";
import {
  Copy,
  HelpCircle,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
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
import { LocationStockItemsDialog } from "./LocationStockItemsDialog";
import { ArrangeLocationDialog } from "../item-location-details/ArrangeLocationDialog";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";

interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  storageId: string;
  branchId: string;
  type: LocationType;
  isActive: boolean;
}

interface InventoryStorage {
  id: string;
  name: string;
  branchId: string;
  isMainStorage?: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

const LOCATION_TYPE_LABEL: Record<LocationType, string> = {
  [LocationType.SHELF]: "Kệ",
  [LocationType.RACK]: "Giá",
  [LocationType.BIN]: "Thùng",
  [LocationType.ZONE]: "Khu vực",
};

const STATUS_LABEL = {
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Ngừng hoạt động",
} as const;

const FILTER_KEYS = ["code", "name"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const naturalCollator = new Intl.Collator("vi-VN", {
  numeric: true,
  sensitivity: "base",
});

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return naturalCollator.compare(a ?? "", b ?? "");
}

function sortLocationsByCode(rows: InventoryLocation[]) {
  return [...rows].sort(
    (a, b) =>
      compareText(a.code, b.code) ||
      compareText(a.name, b.name),
  );
}

function buildNextDuplicateText(base: string, existingValues: Iterable<string>) {
  const normalizedExisting = new Set(
    Array.from(existingValues, (v) => v.trim().toLowerCase()).filter(Boolean),
  );
  const trimmed = base.trim();
  const match = trimmed.match(/^(.*?)(?:\.(\d+))?$/);
  const root = match?.[1]?.trim() || "COPY";
  const start = match?.[2] ? Number(match[2]) + 1 : 2;

  for (let n = start; n < start + 1000; n += 1) {
    const candidate = `${root}.${n}`;
    if (!normalizedExisting.has(candidate.toLowerCase())) return candidate;
  }

  return `${root}.${Date.now()}`;
}

function buildDuplicateLocationDraft(
  selected: InventoryLocation,
  rows: InventoryLocation[],
): Partial<InventoryLocation> {
  return {
    ...selected,
    id: undefined,
    code: buildNextDuplicateText(
      selected.code,
      rows
        .filter((row) => row.storageId === selected.storageId)
        .map((row) => row.code),
    ),
    name: buildNextDuplicateText(
      selected.name || selected.code,
      rows.map((row) => row.name),
    ),
  };
}

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<FilterKey, ColumnFilter>,
  );
}

function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

export function ItemLocationsPage() {
  const [locations, setLocations] = useState<PaginatedResponse<InventoryLocation> | null>(null);
  const [storages, setStorages] = useState<InventoryStorage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>({
    ...DEFAULT_PAGINATION,
    pageSize: 50,
  });
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [storageFilter, setStorageFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<
    | { mode: "create"; initial?: Partial<InventoryLocation> }
    | { mode: "edit"; initial: InventoryLocation }
    | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<InventoryLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockDialogLoc, setStockDialogLoc] = useState<InventoryLocation | null>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);

  const loadStorages = useCallback(async () => {
    const branchId = getActiveBranchId();
    if (!branchId) {
      setStorages([]);
      toast.error("Chưa chọn chi nhánh đang hoạt động.");
      return;
    }
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "200",
        branchId,
      });
      const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
        `/inventory/storages?${params}`,
      );
      setStorages(data.data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  }, []);

  const loadLocations = useCallback(async () => {
    const branchId = getActiveBranchId();
    if (!branchId) {
      toast.error("Chưa chọn chi nhánh đang hoạt động.");
      setLocations({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        branchId,
      });
      if (storageFilter) params.set("storageId", storageFilter);
      const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
        `/inventory/locations?${params}`,
      );
      setLocations(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setLocations({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, storageFilter]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const storageNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of storages) m.set(s.id, s.name);
    return m;
  }, [storages]);

  const selected = useMemo(
    () => (locations?.data ?? []).find((l) => l.id === selectedId) ?? null,
    [locations, selectedId],
  );

  const filteredRows = useMemo(() => {
    const rows = locations?.data ?? [];
    const filtered = rows.filter((row) => {
      if (statusFilter === "active" && !row.isActive) return false;
      if (statusFilter === "inactive" && row.isActive) return false;
      for (const key of FILTER_KEYS) {
        const filter = columnFilters[key];
        if (!filter.value.trim()) continue;
        const text = String(row[key] ?? "").toLowerCase();
        const value = filter.value.toLowerCase();
        const matches =
          filter.mode === "equals"
            ? text === value
            : filter.mode === "startsWith"
              ? text.startsWith(value)
              : filter.mode === "endsWith"
                ? text.endsWith(value)
                : filter.mode === "notContains"
                  ? !text.includes(value)
                  : text.includes(value);
        if (!matches) return false;
      }
      return true;
    });
    return sortLocationsByCode(filtered);
  }, [locations, columnFilters, statusFilter]);

  const handleCreate = useCallback(
    async (draft: LocationDraft) => {
      const branchId = getActiveBranchId();
      if (!branchId) {
        toast.error("Chưa chọn chi nhánh đang hoạt động.");
        return false;
      }
      setSaving(true);
      try {
        await apiClient.post("/inventory/locations", {
          code: draft.code,
          name: draft.name,
          storageId: draft.storageId,
          branchId,
          type: draft.type,
        });
        toast.success("Đã tạo vị trí mới.");
        await loadLocations();
        return true;
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [loadLocations],
  );

  const handleUpdate = useCallback(
    async (id: string, draft: LocationDraft) => {
      setSaving(true);
      try {
        await apiClient.patch(`/inventory/locations/${id}`, {
          name: draft.name,
          type: draft.type,
        });
        toast.success("Đã cập nhật vị trí.");
        await loadLocations();
        return true;
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [loadLocations],
  );

  const handleDeactivate = useCallback(
    async (loc: InventoryLocation) => {
      setSaving(true);
      try {
        await apiClient.patch(`/inventory/locations/${loc.id}`, {
          isActive: false,
        });
        toast.success("Đã ngừng hoạt động vị trí.");
        if (selectedId === loc.id) setSelectedId(null);
        setConfirmDelete(null);
        await loadLocations();
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [loadLocations, selectedId],
  );

  const openStockDialog = useCallback((loc: InventoryLocation) => {
    setStockDialogLoc(loc);
  }, []);

  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Thêm mới",
      icon: Plus,
      onClick: () => setDialogState({ mode: "create" }),
    },
    {
      id: "duplicate",
      label: "Nhân bản",
      icon: Copy,
      disabled: !selected,
      onClick: () => {
        if (!selected) return;
        setDialogState({
          mode: "create",
          initial: buildDuplicateLocationDraft(selected, locations?.data ?? []),
        });
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !selected,
      onClick: () => selected && setDialogState({ mode: "edit", initial: selected }),
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled: !selected || !selected.isActive,
      onClick: () => selected && setConfirmDelete(selected),
    },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => void loadLocations(),
    },
    {
      id: "arrange",
      label: "Xếp vị trí hàng hóa",
      icon: PackageOpen,
      onClick: () => setArrangeOpen(true),
    },
  ];

  const columns: TableColumn<InventoryLocation>[] = [
    {
      key: "code",
      label: "Mã vị trí",
      width: 140,
      render: (row) => (
        <button
          type="button"
          className="text-foreground"
          onClick={() => openStockDialog(row)}
          title="Xem danh sách hàng hóa tại vị trí này"
        >
          {row.code}
        </button>
      ),
    },
    {
      key: "name",
      label: "Tên vị trí",
      width: 200,
      render: (row) => (
        <button
          type="button"
          className="text-primary-blue transition-colors hover:text-primary-blue-hover hover:underline"
          onClick={() => openStockDialog(row)}
          title="Xem danh sách hàng hóa tại vị trí này"
        >
          {row.name}
        </button>
      ),
    },
    {
      key: "storage",
      label: "Thuộc kho",
      width: 220,
      render: (row) => storageNameById.get(row.storageId) ?? row.storageId,
    },
    {
      key: "type",
      label: "Loại",
      width: 120,
      render: (row) => LOCATION_TYPE_LABEL[row.type] ?? row.type,
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 160,
      render: (row) => (row.isActive ? STATUS_LABEL.ACTIVE : STATUS_LABEL.INACTIVE),
    },
  ];

  const columnFilterControl = useMemo(
    () => ({
      filters: {
        ...(columnFilters as unknown as Record<string, ColumnFilter>),
        storage: { mode: "equals" as ColumnFilterMode, value: storageFilter },
        status: { mode: "equals" as ColumnFilterMode, value: statusFilter },
      },
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        if (!FILTER_KEYS.includes(key as FilterKey)) return;
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], mode },
        }));
      },
      onValueChange: (key: string, value: string) => {
        if (key === "storage") {
          setStorageFilter(value);
          setPagination((p) => ({ ...p, page: 1 }));
          return;
        }
        if (key === "status") {
          setStatusFilter(value as "" | "active" | "inactive");
          return;
        }
        if (!FILTER_KEYS.includes(key as FilterKey)) return;
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], value },
        }));
      },
    }),
    [columnFilters, storageFilter, statusFilter],
  );

  return (
    <>
      <DocumentListShell
        title={<InventoryPageTitle>Vị trí hàng hóa</InventoryPageTitle>}
        tabs={<InventoryTabBar activeId="item-locations" />}
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={locations?.total ?? 0}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: nextPageSize }))
            }
            onRefresh={() => void loadLocations()}
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={filteredRows}
          loading={loading}
          emptyLabel="Không có dữ liệu"
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

      {dialogState && (
        <ItemLocationFormDialog
          mode={dialogState.mode}
          initial={dialogState.initial}
          storages={storages}
          saving={saving}
          onClose={() => setDialogState(null)}
          onSave={async (draft, intent) => {
            const ok =
              dialogState.mode === "edit"
                ? await handleUpdate(dialogState.initial.id, draft)
                : await handleCreate(draft);
            if (!ok) return;
            if (intent === "save-and-add" && dialogState.mode === "create") {
              setDialogState({ mode: "create" });
            } else {
              setDialogState(null);
            }
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmActionModal
          title="Ngừng hoạt động vị trí"
          message={`Vị trí ${confirmDelete.code} sẽ không nhận thêm hàng mới. Tiếp tục?`}
          confirmLabel="Ngừng hoạt động"
          cancelLabel="Quay lại"
          loading={saving}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDeactivate(confirmDelete)}
        />
      )}

      {stockDialogLoc && (
        <LocationStockItemsDialog
          locationId={stockDialogLoc.id}
          fallbackTitle={`${storageNameById.get(stockDialogLoc.storageId) ?? ""} - ${stockDialogLoc.code}`}
          onClose={() => setStockDialogLoc(null)}
        />
      )}

      <ArrangeLocationDialog
        open={arrangeOpen}
        onOpenChange={setArrangeOpen}
        onSaved={() => void loadLocations()}
      />
    </>
  );
}

interface LocationDraft {
  code: string;
  name: string;
  storageId: string;
  type: LocationType;
}

function ItemLocationFormDialog({
  mode,
  initial,
  storages,
  saving,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  initial?: Partial<InventoryLocation>;
  storages: InventoryStorage[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: LocationDraft, intent: "save" | "save-and-add") => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [storageId, setStorageId] = useState(initial?.storageId ?? storages[0]?.id ?? "");
  const [type, setType] = useState<LocationType>(initial?.type ?? LocationType.SHELF);
  const [error, setError] = useState<string | null>(null);

  const submit = (intent: "save" | "save-and-add") => {
    if (!code.trim() || !name.trim() || !storageId) {
      setError("Vui lòng điền đầy đủ Mã vị trí, Tên vị trí và Thuộc kho.");
      return;
    }
    setError(null);
    onSave(
      {
        code: code.trim(),
        name: name.trim(),
        storageId,
        type,
      },
      intent,
    );
    if (intent === "save-and-add") {
      setCode("");
      setName("");
    }
  };

  const isEdit = mode === "edit";

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={isEdit ? "Sửa vị trí hàng hóa" : "Thêm mới vị trí hàng hóa"}
      defaultWidth={560}
      defaultHeight={460}
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-primary-blue transition-colors hover:text-primary-blue-hover"
          >
            <HelpCircle className="h-4 w-4" />
            Trợ giúp
          </button>
          <div className="flex items-center gap-2">
            <Button type="button" disabled={saving} onClick={() => submit("save")}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
            {!isEdit ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => submit("save-and-add")}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Lưu và thêm mới
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              <X className="mr-1.5 h-4 w-4" />
              Hủy bỏ
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <FieldRow label="Mã vị trí" required>
          <Input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Vd: A01.01"
            disabled={isEdit}
          />
        </FieldRow>

        <FieldRow label="Tên vị trí" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vd: Kệ A01 tầng 1"
          />
        </FieldRow>

        <FieldRow label="Thuộc kho" required>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
            value={storageId}
            onChange={(e) => setStorageId(e.target.value)}
            disabled={isEdit}
          >
            {storages.length === 0 ? (
              <option value="">Chưa có kho — tạo kho trước</option>
            ) : null}
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Loại vị trí">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as LocationType)}
          >
            {Object.values(LocationType).map((t) => (
              <option key={t} value={t}>
                {LOCATION_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </FieldRow>
      </div>
    </AppModal>
  );
}

function FieldRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3">
      <label className="pt-1.5 text-sm">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      <div>{children}</div>
    </div>
  );
}
