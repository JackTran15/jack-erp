import { useMemo, useState } from "react";
import {
  AppModal,
  Button,
  DocumentListShell,
  Input,
  PageToolbar,
  Textarea,
  type ToolbarItem,
} from "@erp/ui";
import {
  Boxes,
  CloudUpload,
  Copy,
  HelpCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  applyColumnFilter,
  toComparableText,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  MOCK_ITEM_LOCATIONS,
  STATUS_LABEL,
  STOCK_STATUS_LABEL,
  STORAGE_OPTIONS,
  type ItemLocation,
} from "./ItemLocationsPage.fixtures";

// ─── Filters ─────────────────────────────────────────────────────────────────

const FILTER_KEYS = ["code", "name", "description"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<FilterKey, ColumnFilter>,
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function ItemLocationsPage() {
  const [locations, setLocations] = useState<ItemLocation[]>(MOCK_ITEM_LOCATIONS);
  const [pagination, setPagination] = useState<PaginationStateDto>({
    ...DEFAULT_PAGINATION,
    pageSize: 50,
  });
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [storageFilter, setStorageFilter] = useState<string>("");
  const [stockFilter, setStockFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<
    | { mode: "create"; initial?: ItemLocation }
    | { mode: "edit"; initial: ItemLocation }
    | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<ItemLocation | null>(null);

  const selected = useMemo(
    () => locations.find((l) => l.id === selectedId) ?? null,
    [locations, selectedId],
  );

  // ─── Filtering ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return locations.filter((row) => {
      if (storageFilter && row.storageId !== storageFilter) return false;
      if (stockFilter && row.stockStatus !== stockFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      for (const key of FILTER_KEYS) {
        const filter = columnFilters[key];
        if (!filter.value.trim()) continue;
        if (!applyColumnFilter(toComparableText(row[key]), filter)) return false;
      }
      return true;
    });
  }, [locations, columnFilters, storageFilter, stockFilter, statusFilter]);

  const paged = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return filtered.slice(start, start + pagination.pageSize);
  }, [filtered, pagination]);

  const storageNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of STORAGE_OPTIONS) m.set(s.id, s.name);
    return m;
  }, []);

  // ─── Mutations ───────────────────────────────────────────────────────────

  const handleSave = (input: ItemLocationDraft, mode: "create" | "edit") => {
    setLocations((prev) => {
      if (mode === "edit" && input.id) {
        return prev.map((l) => (l.id === input.id ? toRecord(input, l) : l));
      }
      const id = `loc-${input.code || Date.now()}`;
      return [{ ...toRecord(input, undefined), id }, ...prev];
    });
    toast.success(mode === "edit" ? "Đã cập nhật vị trí." : "Đã tạo vị trí mới.");
  };

  const handleDelete = (loc: ItemLocation) => {
    setLocations((prev) => prev.filter((l) => l.id !== loc.id));
    if (selectedId === loc.id) setSelectedId(null);
    setConfirmDelete(null);
    toast.success("Đã xóa vị trí.");
  };

  // ─── Toolbar ─────────────────────────────────────────────────────────────

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
          initial: { ...selected, id: "", code: "", name: "" },
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
      disabled: !selected,
      onClick: () => selected && setConfirmDelete(selected),
    },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => toast.info("Dữ liệu đã được làm mới."),
    },
    {
      id: "arrange",
      label: "Xếp vị trí hàng hóa",
      icon: Boxes,
      onClick: () => toast.info("Tính năng xếp vị trí hàng hóa sẽ được bổ sung."),
    },
    {
      id: "import",
      label: "Nhập khẩu",
      icon: CloudUpload,
      onClick: () => toast.info("Tính năng nhập khẩu sẽ được bổ sung."),
    },
  ];

  // ─── Columns ─────────────────────────────────────────────────────────────

  const columns: TableColumn<ItemLocation>[] = [
    {
      key: "code",
      label: "Mã vị trí",
      width: 140,
      render: (row) => row.code,
    },
    {
      key: "name",
      label: "Tên vị trí",
      width: 180,
      render: (row) => (
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => setDialogState({ mode: "edit", initial: row })}
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
      key: "description",
      label: "Mô tả",
      render: (row) => row.description ?? "",
    },
    {
      key: "stockStatus",
      label: "Xếp hàng hóa",
      width: 140,
      render: (row) => STOCK_STATUS_LABEL[row.stockStatus],
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 160,
      render: (row) => STATUS_LABEL[row.status],
    },
  ];

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        if (!FILTER_KEYS.includes(key as FilterKey)) return;
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], mode },
        }));
      },
      onValueChange: (key: string, value: string) => {
        if (!FILTER_KEYS.includes(key as FilterKey)) return;
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], value },
        }));
      },
    }),
    [columnFilters],
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <DocumentListShell
        title="Vị trí hàng hóa"
        tabs={<InventoryTabBar activeId="item-locations" />}
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={filtered.length}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: nextPageSize }))
            }
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={paged}
          loading={false}
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
          columnFilterControl={{
            ...columnFilterControl,
            filters: {
              ...columnFilterControl.filters,
              storage: { mode: "equals", value: storageFilter },
              stockStatus: { mode: "equals", value: stockFilter },
              status: { mode: "equals", value: statusFilter },
            },
            onValueChange: (key, value) => {
              if (key === "storage") setStorageFilter(value);
              else if (key === "stockStatus") setStockFilter(value);
              else if (key === "status") setStatusFilter(value);
              else columnFilterControl.onValueChange(key, value);
            },
            onModeChange: columnFilterControl.onModeChange,
          }}
        />
      </DocumentListShell>

      {dialogState && (
        <ItemLocationFormDialog
          mode={dialogState.mode}
          initial={dialogState.initial}
          onClose={() => setDialogState(null)}
          onSave={(draft, intent) => {
            handleSave(draft, dialogState.mode);
            if (intent === "save-and-add") {
              setDialogState({ mode: "create" });
            } else {
              setDialogState(null);
            }
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmActionModal
          title="Xóa vị trí hàng hóa"
          message={`Xác nhận xóa vị trí ${confirmDelete.code}?`}
          confirmLabel="Xóa"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </>
  );
}

// ─── Form dialog ─────────────────────────────────────────────────────────────

interface ItemLocationDraft {
  id?: string;
  code: string;
  name: string;
  storageId: string;
  description: string;
}

function toRecord(draft: ItemLocationDraft, existing: ItemLocation | undefined): ItemLocation {
  return {
    id: existing?.id ?? draft.id ?? `loc-${draft.code}`,
    code: draft.code,
    name: draft.name,
    storageId: draft.storageId,
    description: draft.description || undefined,
    stockStatus: existing?.stockStatus ?? "EMPTY",
    status: existing?.status ?? "ACTIVE",
  };
}

function ItemLocationFormDialog({
  mode,
  initial,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  initial?: ItemLocation;
  onClose: () => void;
  onSave: (draft: ItemLocationDraft, intent: "save" | "save-and-add") => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [storageId, setStorageId] = useState(initial?.storageId ?? STORAGE_OPTIONS[0]?.id ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = (intent: "save" | "save-and-add") => {
    if (!code.trim() || !name.trim() || !storageId) {
      setError("Vui lòng điền đầy đủ Mã vị trí, Tên vị trí và Thuộc kho.");
      return;
    }
    setError(null);
    onSave(
      {
        id: initial?.id,
        code: code.trim(),
        name: name.trim(),
        storageId,
        description: description.trim(),
      },
      intent,
    );
    if (intent === "save-and-add") {
      setCode("");
      setName("");
      setDescription("");
    }
  };

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={mode === "create" ? "Thêm mới vị trí hàng hóa" : "Sửa vị trí hàng hóa"}
      defaultWidth={560}
      defaultHeight={460}
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <HelpCircle className="h-4 w-4" />
            Trợ giúp
          </button>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => submit("save")}>
              <Save className="mr-1.5 h-4 w-4" />
              Lưu
            </Button>
            {mode === "create" ? (
              <Button type="button" variant="outline" onClick={() => submit("save-and-add")}>
                <Plus className="mr-1.5 h-4 w-4" />
                Lưu và thêm mới
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
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
            placeholder="Vd: A01.01"
          />
        </FieldRow>

        <FieldRow label="Thuộc kho" required>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={storageId}
            onChange={(e) => setStorageId(e.target.value)}
          >
            {STORAGE_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Mô tả">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
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

