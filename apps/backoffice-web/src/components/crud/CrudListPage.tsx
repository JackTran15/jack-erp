import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { FieldDefinition } from "@erp/shared-interfaces";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type ToolbarActionOption,
  formatMoneyInteger,
} from "@erp/ui";
import {
  buildCrudEntityToolbarSpecs,
  buildListToolbar,
} from "../../lib/list-toolbar";
import { isNotFoundHttpError } from "../../lib/not-found-http-error";
import { HttpErrorView } from "../../pages/errors/HttpErrorPage";
import {
  applyColumnFilter,
  type ColumnFormatKind,
  DEFAULT_COLUMN_FILTER_MODE,
  resolveColumnConfig,
  toComparableText,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../table/pagination.dto";
import { BaseDataTable, type TableColumn } from "../table/BaseDataTable";
import { PaginationControls } from "../table/PaginationControls";
import {
  useCrudConfig,
  useCrudRecords,
  useCrudCreate,
  useCrudDelete,
} from "./useCrudApi";
import { CrudFormDialog } from "./CrudFormDialog";
import { CrudRecordDialog } from "./CrudRecordDialog";
import { formatCustomerStatus } from "../../lib/customer-display";

/** Entity keys that open create/edit as a dialog instead of navigating to a new page. */
const DIALOG_MODE_ENTITIES = new Set([
  "inventory-item-units",
  "inventory-providers",
  "provider-groups",
]);
import { AdminPageShell } from "../layout/AdminPageShell";
import { TableActionHeader } from "../layout/TableActionHeader";
import { resolveBackofficeBreadcrumbs } from "../layout/breadcrumbs";

export interface CrudListInventoryActionContext {
  entityKey: string;
  idField: string;
  filteredRecords: Record<string, unknown>[];
  selectedRows: Record<string, unknown>[];
  selectedRecordIds: string[];
  refetchRecords: () => void;
}

interface CrudListPageProps {
  entityKey?: string;
  initialSort?: { sortBy: string; sortOrder: 'asc' | 'desc' };
  inventoryConfig?: {
    exportOptions?: Array<{
      id: string;
      label: string;
      action: "export-all" | "export-selected";
    }>;
    onImportInventory?: (context: CrudListInventoryActionContext) => void;
    onExportInventoryAll?: (context: CrudListInventoryActionContext) => void;
    onExportInventorySelected?: (context: CrudListInventoryActionContext) => void;
    renderDialogs?: (context: CrudListInventoryActionContext) => ReactNode;
  };
}

export function CrudListPage({
  entityKey: entityKeyProp,
  initialSort,
  inventoryConfig,
}: CrudListPageProps) {
  const params = useParams<{ entityKey: string }>();
  const entityKey = entityKeyProp ?? params.entityKey;
  const navigate = useNavigate();
  const location = useLocation();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string | undefined>(initialSort?.sortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initialSort?.sortOrder ?? "desc");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >({});

  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [duplicateSnapshot, setDuplicateSnapshot] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Dialog-mode create/edit (for entities in DIALOG_MODE_ENTITIES)
  const [crudDialogOpen, setCrudDialogOpen] = useState(false);
  const [crudDialogRecordId, setCrudDialogRecordId] = useState<string | null>(null);
  const openCreateDialog = () => { setCrudDialogRecordId(null); setCrudDialogOpen(true); };
  const openEditDialog = (id: string) => { setCrudDialogRecordId(id); setCrudDialogOpen(true); };
  const useDialogMode = entityKey ? DIALOG_MODE_ENTITIES.has(entityKey) : false;

  const {
    data: config,
    isLoading: configLoading,
    error: configError,
  } = useCrudConfig(entityKey ?? "");

  const {
    data: records,
    isLoading: loading,
    refetch: refetchRecords,
  } = useCrudRecords(
    entityKey ?? "",
    { page, pageSize, sortBy, sortOrder, search, filters: {} },
    Boolean(config && entityKey),
  );

  const createMutation = useCrudCreate(entityKey ?? "");
  const deleteMutation = useCrudDelete(entityKey ?? "");

  useEffect(() => {
    setPage(1);
    setPageSize(20);
    setSortBy(initialSort?.sortBy);
    setSortOrder(initialSort?.sortOrder ?? "desc");
    setSearch("");
    setSearchInput("");
    setColumnFilters({});
    setSelectedRecordIds(new Set());
    setDuplicateSnapshot(null);
  }, [entityKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!records) {
      setSelectedRecordIds(new Set());
      return;
    }
    const idField = config?.idField ?? "id";
    const availableIds = new Set(
      records.data.map((record) => String(record[idField])),
    );
    setSelectedRecordIds((prev) => {
      const next = new Set([...prev].filter((id) => availableIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [records, config?.idField]);

  const filteredRecords = useMemo(() => {
    const source = records?.data ?? [];
    const fields = config?.fields ?? [];
    return source.filter((record) =>
      fields.every((field) => {
        const filter = columnFilters[field.key];
        if (!filter || !filter.value.trim()) {
          return true;
        }

        const comparable = toComparableText(record[field.key]);
        return applyColumnFilter(comparable, filter);
      }),
    );
  }, [records?.data, config?.fields, columnFilters]);

  useEffect(() => {
    const visibleIds = new Set(
      filteredRecords.map((record) => String(record[config?.idField ?? "id"])),
    );
    setSelectedRecordIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRecords, config?.idField]);

  const filterDefinitionByKey = useMemo(() => {
    const definitions = config?.filterDefinitions ?? [];
    const map = new Map<string, (typeof definitions)[number]>();
    definitions.forEach((definition) => {
      map.set(definition.key, definition);
    });
    return map;
  }, [config?.filterDefinitions]);

  const tableColumns = useMemo<TableColumn<Record<string, unknown>>[]>(
    () =>
      (config?.fields ?? []).filter((field) => !field.hideInList).map((field) => {
        const col = resolveColumnConfig(entityKey ?? "", field);
        const widthPx = col.widthPx;
        const filterDef = filterDefinitionByKey.get(field.key);
        // Pick filter UI per column. Boolean fields and any field whose
        // server-declared `filterDefinition.type === 'select'` get the dropdown
        // filter; everything else falls back to the operator/value combo.
        const useSelect =
          (filterDef?.type === "select" && filterDef.options?.length) ||
          field.type === "boolean";
        const selectOptions =
          filterDef?.type === "select"
            ? filterDef.options
            : field.type === "boolean"
              ? [
                  { value: "true", label: "Có" },
                  { value: "false", label: "Không" },
                ]
              : undefined;
        const alignRight = col.align === "right";
        return {
          key: field.key,
          label: field.label,
          width: widthPx,
          headerClassName: `w-[${widthPx}px] min-w-[${widthPx}px]`,
          className: alignRight
            ? `max-w-[${widthPx}px] text-right tabular-nums`
            : `max-w-[${widthPx}px]`,
          render: (row) => formatCell(row[field.key], field, col.format),
          filterKind: useSelect ? "select" : "symbol",
          filterOptions: selectOptions,
        };
      }),
    [config?.fields, entityKey, filterDefinitionByKey],
  );

  // ─── Hooks that previously sat AFTER early-returns (Rules-of-Hooks fix) ──
  const idField = config?.idField ?? "id";

  const selectedRows = useMemo(
    () =>
      filteredRecords.filter((record) =>
        selectedRecordIds.has(String(record[idField])),
      ),
    [filteredRecords, selectedRecordIds, idField],
  );

  const inventoryActionContext = useMemo<CrudListInventoryActionContext>(
    () => ({
      entityKey: entityKey ?? "",
      idField,
      filteredRecords,
      selectedRows,
      selectedRecordIds: selectedRows.map((record) => String(record[idField])),
      refetchRecords: () => void refetchRecords(),
    }),
    [idField, entityKey, filteredRecords, selectedRows, refetchRecords],
  );

  const exportInventoryOptions = useMemo<ToolbarActionOption[] | undefined>(() => {
    if (!inventoryConfig?.exportOptions?.length) return undefined;
    return inventoryConfig.exportOptions.map((option) => ({
      id: option.id,
      label: option.label,
      onClick:
        option.action === "export-selected"
          ? () => inventoryConfig.onExportInventorySelected?.(inventoryActionContext)
          : () => inventoryConfig.onExportInventoryAll?.(inventoryActionContext),
    }));
  }, [
    inventoryActionContext,
    inventoryConfig?.exportOptions,
    inventoryConfig?.onExportInventoryAll,
    inventoryConfig?.onExportInventorySelected,
  ]);

  if (configLoading) {
    return (
      <AdminPageShell>
        <p>Đang tải cấu hình…</p>
      </AdminPageShell>
    );
  }
  if (configError) {
    if (isNotFoundHttpError(configError)) {
      return (
        <AdminPageShell>
          <HttpErrorView code={404} />
        </AdminPageShell>
      );
    }
    return (
      <AdminPageShell>
        <p className="text-destructive">
          Lỗi:{" "}
          {configError instanceof Error
            ? configError.message
            : "Không tải được"}
        </p>
      </AdminPageShell>
    );
  }
  if (!entityKey || !config) {
    return (
      <AdminPageShell>
        <p>Không tìm thấy thực thể.</p>
      </AdminPageShell>
    );
  }

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleCreate = () => {
    if (useDialogMode) { openCreateDialog(); return; }
    navigate(`/admin/${entityKey}/new`);
  };

  const handleColumnFilterModeChange = (
    fieldKey: string,
    mode: ColumnFilterMode,
  ) => {
    setColumnFilters((prev) => ({
      ...prev,
      [fieldKey]: {
        mode,
        value: prev[fieldKey]?.value ?? "",
      },
    }));
  };

  const handleColumnFilterValueChange = (fieldKey: string, value: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [fieldKey]: {
        mode: prev[fieldKey]?.mode ?? DEFAULT_COLUMN_FILTER_MODE,
        value,
      },
    }));
  };

  const selectedRecord = selectedRows.length === 1 ? selectedRows[0] : null;
  const areAllVisibleSelected =
    filteredRecords.length > 0 &&
    selectedRows.length === filteredRecords.length;

  const openDuplicateDialog = () => {
    if (!selectedRecord) return;
    setDuplicateSnapshot({ ...selectedRecord });
  };

  const handleDuplicateSubmit = async (data: Record<string, unknown>) => {
    await createMutation.mutateAsync(data);
    setDuplicateSnapshot(null);
    void refetchRecords();
  };

  const handleDeleteSelected = () => {
    if (selectedRows.length === 0) return;
    setDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (selectedRows.length === 0) return;
    await Promise.all(
      selectedRows.map((record) =>
        deleteMutation.mutateAsync(String(record[config.idField])),
      ),
    );
    setSelectedRecordIds(new Set());
    setDeleteDialogOpen(false);
  };

  const toolbarItems = buildListToolbar(
    buildCrudEntityToolbarSpecs(
      entityKey,
      {
        handleCreate,
        openDuplicateDialog,
        handleEdit: () => {
          if (!selectedRecord) return;
          const id = String(selectedRecord[config.idField]);
          if (useDialogMode) { openEditDialog(id); return; }
          void navigate(`/admin/${entityKey}/${id}/edit`);
        },
        handleDeleteSelected: () => void handleDeleteSelected(),
        refetchRecords,
        navigate: (to) => void navigate(to),
        onImportInventory:
          inventoryConfig?.onImportInventory
            ? () => inventoryConfig.onImportInventory?.(inventoryActionContext)
            : undefined,
        onExportInventory:
          inventoryConfig
            ? () => inventoryConfig.onExportInventoryAll?.(inventoryActionContext)
            : undefined,
        onExportInventoryAll:
          inventoryConfig
            ? () => inventoryConfig.onExportInventoryAll?.(inventoryActionContext)
            : undefined,
        onExportInventorySelected:
          inventoryConfig?.onExportInventorySelected
            ? () => inventoryConfig.onExportInventorySelected?.(inventoryActionContext)
            : undefined,
        exportInventoryOptions,
      },
      {
        selectedRecord,
        selectedCount: selectedRows.length,
      },
    ),
  );

  const breadcrumbs = resolveBackofficeBreadcrumbs(location.pathname);

  return (
    <AdminPageShell>
      <div className="mb-2 shrink-0">
        <h1 className="text-2xl font-semibold">{config.displayName}</h1>
      </div>

      <TableActionHeader
        className="mb-3 shrink-0"
        breadcrumbs={breadcrumbs}
        items={toolbarItems}
      />

      <BaseDataTable
        columns={tableColumns}
        rows={filteredRecords}
        loading={loading}
        emptyLabel="Không có bản ghi."
        getRowKey={(row) => String(row[config.idField])}
        onRowClick={(row) => {
          const id = String(row[config.idField]);
          navigate(`/admin/${entityKey}/${id}`);
        }}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        columnFilterControl={{
          filters: columnFilters,
          onModeChange: handleColumnFilterModeChange,
          onValueChange: handleColumnFilterValueChange,
        }}
        leadingColumn={{
          width: 40,
          header: (
            <input
              type="checkbox"
              aria-label="Chọn tất cả"
              checked={areAllVisibleSelected}
              onChange={(event) => {
                if (event.target.checked) {
                  setSelectedRecordIds(
                    new Set(
                      filteredRecords.map((record) =>
                        String(record[config.idField]),
                      ),
                    ),
                  );
                } else {
                  setSelectedRecordIds(new Set());
                }
              }}
            />
          ),
          cell: (row) => (
            <div onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedRecordIds.has(String(row[config.idField]))}
                onChange={(event) => {
                  event.stopPropagation();
                  const id = String(row[config.idField]);
                  setSelectedRecordIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          ),
        }}
        footer={
          records && !loading ? (
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={records.total}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
              onRefresh={() => void refetchRecords()}
            />
          ) : null
        }
      />

      {duplicateSnapshot && (
        <CrudFormDialog
          key={String(duplicateSnapshot[config.idField] ?? "dup")}
          config={config}
          record={null}
          duplicateSource={duplicateSnapshot}
          onSubmit={handleDuplicateSubmit}
          onClose={() => setDuplicateSnapshot(null)}
        />
      )}

      {inventoryConfig?.renderDialogs?.(inventoryActionContext)}

      {useDialogMode && entityKey && (
        <CrudRecordDialog
          entityKey={entityKey}
          recordId={crudDialogRecordId}
          open={crudDialogOpen}
          onClose={() => setCrudDialogOpen(false)}
          onSuccess={() => { void refetchRecords(); }}
        />
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xoá</DialogTitle>
            <DialogDescription>
              Xoá {selectedRows.length} bản ghi đã chọn? Thao tác này không thể
              hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void confirmBulkDelete()}
            >
              {deleteMutation.isPending ? "Đang xoá..." : "Xoá"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}

function formatCell(
  value: unknown,
  field: FieldDefinition,
  format: ColumnFormatKind | undefined,
): React.ReactNode {
  if (value === null || value === undefined) return "—";
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        disabled
        readOnly
        className="h-5 w-5 rounded border-2 border-input accent-primary cursor-default disabled:opacity-70"
      />
    );
  }
  if (format === "moneyVnd") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "—";
    return formatMoneyInteger(n);
  }
  if (format === "numberVi" || field.type === "number") {
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) return String(value);
    return new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
  }
  if (format === "customerStatus") return formatCustomerStatus(value);
  if (field.type === "date") {
    try {
      return new Date(String(value)).toLocaleDateString("vi-VN");
    } catch {
      return String(value);
    }
  }
  return String(value);
}
