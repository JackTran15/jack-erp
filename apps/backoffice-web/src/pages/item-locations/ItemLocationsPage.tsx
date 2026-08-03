import {
  AppModal,
  Button,
  DocumentListShell,
  Input,
  PageToolbar,
  type ToolbarItem,
} from "@erp/ui";
import {
  Copy,
  Download,
  HelpCircle,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildV2Body,
  type V2SearchConfig,
} from "../../components/crud/crudV2Search";
import {
  searchLocationsV2,
  type LocationRow,
} from "../../api/inventory-locations";
import {
  InventoryPageTitle,
  InventoryTabBar,
} from "../../components/document/inventoryTabs";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { ActiveStatusBadge } from "../../components/status/StatusBadge";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { PaginationControls } from "../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { ArrangeLocationDialog } from "../item-location-details/ArrangeLocationDialog";
import { LocationStockItemsDialog } from "./LocationStockItemsDialog";
import { ImportLocationDialog } from "./import/ImportLocationDialog";
import { downloadLocationsExcel } from "./import/import-location.api";

type InventoryLocation = LocationRow;

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

const STATUS_LABEL = {
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Ngừng hoạt động",
} as const;

/**
 * Column key → v2 filter kind. Only these keys are sent to
 * `POST /v2/inventory/locations/search` (the backend runs forbidNonWhitelisted).
 */
const V2_SEARCH: V2SearchConfig = {
  path: "/v2/inventory/locations/search",
  fields: {
    code: "string",
    name: "string",
    description: "string",
    storageId: "enum",
    isActive: "boolean",
    hasItems: "boolean",
  },
};

const naturalCollator = new Intl.Collator("vi-VN", {
  numeric: true,
  sensitivity: "base",
});

function compareText(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return naturalCollator.compare(a ?? "", b ?? "");
}

function sortLocationsByCode(rows: InventoryLocation[]) {
  return [...rows].sort(
    (a, b) => compareText(a.code, b.code) || compareText(a.name, b.name),
  );
}

function buildNextDuplicateText(
  base: string,
  existingValues: Iterable<string>,
) {
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

function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

export function ItemLocationsPage() {
  const qc = useQueryClient();
  const [storages, setStorages] = useState<InventoryStorage[]>([]);
  const [pagination, setPagination] = useState<PaginationStateDto>({
    ...DEFAULT_PAGINATION,
    pageSize: 50,
  });
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<
    | { mode: "create"; initial?: Partial<InventoryLocation> }
    | { mode: "edit"; initial: InventoryLocation }
    | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<InventoryLocation | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [stockDialogLoc, setStockDialogLoc] =
    useState<InventoryLocation | null>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  const activeBranchId = getActiveBranchId();

  const searchBody = useMemo(
    () => buildV2Body(V2_SEARCH, filters, pagination.page, pagination.pageSize),
    [filters, pagination.page, pagination.pageSize],
  );

  const locationsQuery = useQuery({
    queryKey: ["inventory-locations", activeBranchId, searchBody],
    queryFn: () => searchLocationsV2(searchBody),
    enabled: Boolean(activeBranchId),
  });

  const reloadLocations = useCallback(
    () => qc.invalidateQueries({ queryKey: ["inventory-locations"] }),
    [qc],
  );

  // Filtering now happens server-side across the whole branch, so any filter
  // change invalidates the current page offset.
  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [filters]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  useEffect(() => {
    if (locationsQuery.error) {
      toast.error(getUserFacingApiErrorMessage(locationsQuery.error));
    }
  }, [locationsQuery.error]);

  const storageNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of storages) m.set(s.id, s.name);
    return m;
  }, [storages]);

  const storageFilterOptions = useMemo(
    () => storages.map((s) => ({ value: s.id, label: s.name })),
    [storages],
  );

  const rows = useMemo(
    () => sortLocationsByCode(locationsQuery.data?.data ?? []),
    [locationsQuery.data?.data],
  );

  const selected = useMemo(
    () => rows.find((l) => l.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const selectedStorage = useMemo(
    () => storages.find((s) => s.id === selected?.storageId) ?? null,
    [selected?.storageId, storages],
  );
  const selectedArrangeLocation = useMemo(
    () =>
      selected
        ? {
            id: selected.id,
            code: selected.code,
            name: selected.name,
            storageId: selected.storageId,
            storageName: storageNameById.get(selected.storageId) ?? "",
          }
        : null,
    [selected, storageNameById],
  );

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
          description: draft.description || undefined,
          isActive: draft.isActive,
        });
        toast.success("Đã tạo vị trí mới.");
        await reloadLocations();
        return true;
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [reloadLocations],
  );

  const handleUpdate = useCallback(
    async (id: string, draft: LocationDraft) => {
      setSaving(true);
      try {
        await apiClient.patch(`/inventory/locations/${id}`, {
          code: draft.code,
          name: draft.name,
          storageId: draft.storageId,
          description: draft.description,
          isActive: draft.isActive,
        });
        toast.success("Đã cập nhật vị trí.");
        await reloadLocations();
        return true;
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [reloadLocations],
  );

  const handleDeactivate = useCallback(
    async (loc: InventoryLocation) => {
      setSaving(true);
      setConfirmDelete(null);
      try {
        await apiClient.patch(`/inventory/locations/${loc.id}`, {
          isActive: false,
        });
        toast.success("Đã ngừng hoạt động vị trí.");
        if (selectedId === loc.id) setSelectedId(null);
        await reloadLocations();
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [reloadLocations, selectedId],
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
          initial: buildDuplicateLocationDraft(selected, rows),
        });
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !selected,
      onClick: () =>
        selected && setDialogState({ mode: "edit", initial: selected }),
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled:
        !selected ||
        !selected.isActive ||
        selected.isDefault === true ||
        selectedStorage?.isMainStorage === true,
      onClick: () => selected && setConfirmDelete(selected),
    },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => void reloadLocations(),
    },
    {
      id: "import",
      label: "Nhập khẩu",
      icon: Upload,
      onClick: () => setImportOpen(true),
    },
    {
      id: "export",
      label: "Xuất khẩu",
      icon: Download,
      onClick: async () => {
        try {
          await downloadLocationsExcel();
          toast.success("Đã tải tệp xuất khẩu");
        } catch (err) {
          toast.error(
            getUserFacingApiErrorMessage(err) || "Xuất khẩu thất bại",
          );
        }
      },
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
      key: "storageId",
      label: "Thuộc kho",
      width: 220,
      filterKind: "select",
      filterOptions: storageFilterOptions,
      render: (row) => storageNameById.get(row.storageId) ?? row.storageId,
    },
    {
      key: "description",
      label: "Mô tả",
      width: 280,
      render: (row) =>
        row.description?.trim() ? (
          row.description
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "hasItems",
      label: "Xếp hàng hóa",
      width: 140,
      filterKind: "select",
      filterOptions: [
        { value: "true", label: "Đã xếp" },
        { value: "false", label: "Chưa xếp" },
      ],
      render: (row) =>
        row.hasItems ? (
          "Đã xếp"
        ) : (
          <span className="text-muted-foreground">Chưa xếp</span>
        ),
    },
    {
      key: "isActive",
      label: "Trạng thái",
      width: 160,
      filterKind: "select",
      filterOptions: [
        { value: "true", label: STATUS_LABEL.ACTIVE },
        { value: "false", label: STATUS_LABEL.INACTIVE },
      ],
      render: (row) => (
        <ActiveStatusBadge
          active={row.isActive}
          inactiveLabel={STATUS_LABEL.INACTIVE}
        />
      ),
    },
  ];

  const columnFilterControl = useMemo(
    () => ({
      filters,
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        setFilters((prev) => ({
          ...prev,
          [key]: { mode, value: prev[key]?.value ?? "" },
        }));
      },
      onValueChange: (key: string, value: string) => {
        setFilters((prev) => ({
          ...prev,
          [key]: { mode: prev[key]?.mode ?? DEFAULT_COLUMN_FILTER_MODE, value },
        }));
      },
    }),
    [filters],
  );

  return (
    <>
      <DocumentListShell
        title={<InventoryPageTitle>Vị trí hàng hóa</InventoryPageTitle>}
        tabs={<InventoryTabBar activeId="item-locations" />}
        toolbar={
          <PageToolbar
            items={toolbarItems}
            tone="primary"
            className="m-2 rounded-md"
          />
        }
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={locationsQuery.data?.total ?? 0}
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
            onRefresh={() => void reloadLocations()}
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={rows}
          loading={locationsQuery.isFetching}
          emptyLabel="Không có dữ liệu"
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          onRowDoubleClick={(row) =>
            setDialogState({ mode: "edit", initial: row })
          }
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

      <ImportLocationDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onCommitted={() => void reloadLocations()}
      />

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
        onSaved={() => void reloadLocations()}
        initialLocation={selectedArrangeLocation}
      />
    </>
  );
}

interface LocationDraft {
  code: string;
  name: string;
  storageId: string;
  description: string;
  isActive: boolean;
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
  const [storageId, setStorageId] = useState(
    initial?.storageId ?? storages[0]?.id ?? "",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
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
        description: description.trim(),
        isActive,
      },
      intent,
    );
    if (intent === "save-and-add") {
      setCode("");
      setName("");
      setDescription("");
      setIsActive(true);
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
            <Button
              type="button"
              className="!bg-primary-blue !text-primary-blue-foreground hover:!bg-primary-blue-hover"
              disabled={saving}
              onClick={() => submit("save")}
            >
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
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onClose}
            >
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

        <FieldRow label="Mô tả">
          <textarea
            className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ghi chú cho vị trí (không bắt buộc)"
            maxLength={500}
          />
        </FieldRow>

        <FieldRow label="Trạng thái">
          <div className="flex items-center gap-6 pt-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="location-status"
                checked={isActive}
                onChange={() => setIsActive(true)}
              />
              Đang hoạt động
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="location-status"
                checked={!isActive}
                onChange={() => setIsActive(false)}
              />
              Ngừng hoạt động
            </label>
          </div>
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
