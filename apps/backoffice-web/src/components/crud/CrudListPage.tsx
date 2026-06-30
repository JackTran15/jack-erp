import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { FieldDefinition } from "@erp/shared-interfaces";
import { toast } from "sonner";
import {
  Button,
  Badge,
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
  useCrudUpdate,
} from "./useCrudApi";
import { useCrudV2Search } from "./useCrudV2Search";
import { CRUD_V2_SEARCH, buildV2Body } from "./crudV2Search";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { CrudFormDialog } from "./CrudFormDialog";
import { formatCrudFieldValue } from "../../lib/crud-display";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { CrudRecordDialog } from "./CrudRecordDialog";
import { formatCustomerStatus } from "../../lib/customer-display";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { flattenCategoryTree, collectParentIds } from "./itemCategoryTree";
import { useItemCategoryTree } from "./useItemCategoryTree";
import { useCrudListReturnState } from "./useCrudListReturnState";

/** Entity keys that open create/edit as a dialog instead of navigating to a new page. */
const DIALOG_MODE_ENTITIES = new Set([
  "inventory-item-units",
  "inventory-providers",
  "provider-groups",
  "branches",
  "inventory-storages",
]);

function areStringSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}
import { AdminPageShell } from "../layout/AdminPageShell";
import { PageHeader } from "../layout/PageHeader";
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
  initialSort?: { sortBy: string; sortOrder: "asc" | "desc" };
  disableRowClick?: boolean;
  onRecordSaved?: () => void;
  inventoryConfig?: {
    exportOptions?: Array<{
      id: string;
      label: string;
      action: "export-all" | "export-selected";
    }>;
    onImportInventory?: (context: CrudListInventoryActionContext) => void;
    onExportInventoryAll?: (context: CrudListInventoryActionContext) => void;
    onExportInventorySelected?: (
      context: CrudListInventoryActionContext,
    ) => void;
    renderDialogs?: (context: CrudListInventoryActionContext) => ReactNode;
  };
}

export function CrudListPage({
  entityKey: entityKeyProp,
  initialSort,
  disableRowClick,
  onRecordSaved,
  inventoryConfig,
}: CrudListPageProps) {
  const params = useParams<{ entityKey: string }>();
  const entityKey = entityKeyProp ?? params.entityKey;
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(
    new Set(),
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<Record<string, unknown> | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [duplicateSnapshot, setDuplicateSnapshot] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const resetListUiState = useCallback(() => {
    setSelectedRecordIds(new Set());
    setCreateDialogOpen(false);
    setEditSnapshot(null);
    setDuplicateSnapshot(null);
    setCollapsedIds(new Set());
  }, []);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    search,
    setSearch,
    searchInput,
    setSearchInput,
    columnFilters,
    setColumnFilters,
    goToEdit,
  } = useCrudListReturnState({
    entityKey,
    initialSort,
    onEntityReset: resetListUiState,
  });

  // Dialog-mode create/edit (for entities in DIALOG_MODE_ENTITIES)
  const [crudDialogOpen, setCrudDialogOpen] = useState(false);
  const [crudDialogRecordId, setCrudDialogRecordId] = useState<string | null>(
    null,
  );
  const openCreateDialog = () => {
    setCrudDialogRecordId(null);
    setCrudDialogOpen(true);
  };
  const openEditDialog = (id: string) => {
    setCrudDialogRecordId(id);
    setCrudDialogOpen(true);
  };
  const useDialogMode = entityKey ? DIALOG_MODE_ENTITIES.has(entityKey) : false;

  // Nhóm hàng hoá renders as a collapsible parent → child tree instead of the
  // flat paginated list. Ids in `collapsedIds` have their children hidden.
  const isCategoryTree = entityKey === "inventory-item-categories";
  const toggleCategoryCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const {
    data: config,
    isLoading: configLoading,
    error: configError,
  } = useCrudConfig(entityKey ?? "");

  // Entities with a server-side CQRS search endpoint filter against the whole
  // dataset (server-side) instead of the loaded page; everything else keeps the
  // generic GET /records + client-side filtering path.
  const v2 = entityKey ? CRUD_V2_SEARCH[entityKey] : undefined;

  const debouncedColumnFilters = useDebouncedValue(columnFilters, 300);
  const v2Body = useMemo(
    () => (v2 ? buildV2Body(v2, debouncedColumnFilters, page, pageSize) : null),
    [v2, debouncedColumnFilters, page, pageSize],
  );

  const recordsQuery = useCrudRecords(
    entityKey ?? "",
    { page, pageSize, sortBy, sortOrder, search, filters: {} },
    Boolean(config && entityKey) && !v2,
  );
  const v2Query = useCrudV2Search(
    entityKey ?? "",
    v2Body,
    Boolean(v2 && config) && !isCategoryTree,
  );

  // Tree data source (Nhóm hàng hoá only). Search is driven by the code/name
  // column filters; the backend prunes the tree and keeps matching branches.
  const treeSearch = (
    debouncedColumnFilters.name?.value ||
    debouncedColumnFilters.code?.value ||
    ""
  ).trim();
  const treeQuery = useItemCategoryTree(
    { search: treeSearch || undefined },
    isCategoryTree && Boolean(config),
  );
  const treeNodes = useMemo(
    () => treeQuery.data?.data ?? [],
    [treeQuery.data],
  );
  // When searching, the returned tree is already pruned to matches — show it
  // fully expanded so every match is visible regardless of collapse state.
  const treeVisibleRows = useMemo(
    () => flattenCategoryTree(treeNodes, treeSearch ? undefined : collapsedIds),
    [treeNodes, collapsedIds, treeSearch],
  );
  const treeAllRows = useMemo(() => flattenCategoryTree(treeNodes), [treeNodes]);
  const categoryTreeRecords = useMemo(
    () => ({
      data: treeAllRows,
      total: treeAllRows.length,
      page: 1,
      limit: treeAllRows.length,
    }),
    [treeAllRows],
  );

  const records = isCategoryTree
    ? categoryTreeRecords
    : v2
      ? v2Query.data
      : recordsQuery.data;
  const loading = isCategoryTree
    ? treeQuery.isLoading
    : v2
      ? v2Query.isLoading
      : recordsQuery.isLoading;
  const refetchRecords = () => {
    if (isCategoryTree) void treeQuery.refetch();
    else if (v2) void v2Query.refetch();
    else void recordsQuery.refetch();
  };

  const createMutation = useCrudCreate(entityKey ?? "");
  const updateMutation = useCrudUpdate(entityKey ?? "");
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
    setCreateDialogOpen(false);
    setEditSnapshot(null);
    setDuplicateSnapshot(null);
    setCollapsedIds(new Set());
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
    // Tree mode renders the collapse-aware flattened rows.
    if (isCategoryTree) return treeVisibleRows;
    const source = records?.data ?? [];
    // v2 entities are filtered server-side — render the rows as-is.
    if (v2) return source;
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
  }, [records?.data, config?.fields, columnFilters, v2, isCategoryTree, treeVisibleRows]);

  useEffect(() => {
    const visibleIds = new Set(
      filteredRecords.map((record) => String(record[config?.idField ?? "id"])),
    );
    setSelectedRecordIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      if (next.size === 0 && filteredRecords.length > 0) {
        next.add(String(filteredRecords[0][config?.idField ?? "id"]));
      }
      return areStringSetsEqual(next, prev) ? prev : next;
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
      (config?.fields ?? [])
        .filter((field) => !field.hideInList)
        .map((field) => {
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
          // For v2 (server-side) entities, a column is filterable only when it
          // maps to a v2 DTO field; date fields use the from/to range cell.
          const v2Kind = v2?.fields[field.key];
          let filterKind:
            | "symbol"
            | "select"
            | "date-range"
            | "number-range"
            | "none";
          let filterOptions = selectOptions;
          if (v2) {
            if (!v2Kind) {
              filterKind = "none";
              filterOptions = undefined;
            } else if (v2Kind === "date-range") {
              filterKind = "date-range";
              filterOptions = undefined;
            } else if (v2Kind === "compare") {
              filterKind = "number-range";
              filterOptions = undefined;
            } else {
              filterKind = useSelect ? "select" : "symbol";
            }
          } else {
            filterKind = useSelect ? "select" : "symbol";
          }
          // For inventory items, the primary identifier cells (Mã SKU / Tên hàng hóa)
          // open the edit screen directly instead of the row's detail view.
          const opensEdit =
            entityKey === "inventory-items" &&
            (field.key === "code" || field.key === "name");
          return {
            key: field.key,
            label: field.label,
            width: widthPx,
            headerClassName: `w-[${widthPx}px] min-w-[${widthPx}px]`,
            className: alignRight
              ? `max-w-[${widthPx}px] text-right tabular-nums`
              : `max-w-[${widthPx}px]`,
            render: (row) => {
              if (isCategoryTree && field.key === "code") {
                const depth = Number(row.__depth ?? 0);
                const hasChildren = Boolean(row.__hasChildren);
                const collapsed = Boolean(row.__collapsed);
                return (
                  <div
                    className="flex items-center"
                    style={{ paddingLeft: depth * 18 }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        aria-label={collapsed ? "Mở rộng" : "Thu gọn"}
                        className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCategoryCollapse(
                            String(row[config?.idField ?? "id"]),
                          );
                        }}
                      >
                        {collapsed ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="mr-1 inline-block h-4 w-4 shrink-0" />
                    )}
                    <span className={hasChildren ? "font-semibold" : undefined}>
                      {formatCell(row[field.key], field, col.format)}
                    </span>
                  </div>
                );
              }
              if (
                entityKey === "inventory-item-categories" &&
                field.key === "name"
              ) {
                return (
                  <button
                    type="button"
                    className={`text-primary-blue transition-colors hover:text-primary-blue-hover hover:underline${
                      row.__hasChildren ? " font-semibold" : ""
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditSnapshot({ ...row });
                      setSelectedRecordIds(
                        new Set([String(row[config?.idField ?? "id"])]),
                      );
                    }}
                  >
                    {formatCell(row[field.key], field, col.format)}
                  </button>
                );
              }
              const content = formatCell(
                row[field.key],
                field,
                col.format,
                entityKey,
              );
              if (!opensEdit) return content;
              return (
                <button
                  type="button"
                  className="text-left font-medium text-primary hover:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    goToEdit(String(row[config?.idField ?? "id"]));
                  }}
                >
                  {content}
                </button>
              );
            },
            filterKind,
            filterOptions,
          };
        }),
    [
      config?.fields,
      config?.idField,
      entityKey,
      filterDefinitionByKey,
      goToEdit,
      v2,
      isCategoryTree,
      toggleCategoryCollapse,
    ],
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
  const isBranchEntity = entityKey === "branches";
  const deleteDialogDescription = isBranchEntity
    ? selectedRows.length === 1
      ? "Bạn có chắc muốn xoá cửa hàng này? Thao tác này sẽ xoá hẳn cửa hàng nếu chưa có phát sinh dữ liệu liên quan."
      : `Bạn có chắc muốn xoá ${selectedRows.length} cửa hàng đã chọn? Hệ thống chỉ xoá hẳn các cửa hàng chưa có phát sinh dữ liệu liên quan.`
    : `Xoá ${selectedRows.length} bản ghi đã chọn? Thao tác này không thể hoàn tác.`;

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

  const exportInventoryOptions = useMemo<
    ToolbarActionOption[] | undefined
  >(() => {
    if (!inventoryConfig?.exportOptions?.length) return undefined;
    return inventoryConfig.exportOptions.map((option) => ({
      id: option.id,
      label: option.label,
      onClick:
        option.action === "export-selected"
          ? () =>
              inventoryConfig.onExportInventorySelected?.(
                inventoryActionContext,
              )
          : () =>
              inventoryConfig.onExportInventoryAll?.(inventoryActionContext),
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
    if (entityKey === "inventory-item-categories") {
      setCreateDialogOpen(true);
      return;
    }
    if (useDialogMode) {
      openCreateDialog();
      return;
    }
    navigate(`/admin/${entityKey}/new`);
  };

  const handleCreateSubmit = async (data: Record<string, unknown>) => {
    try {
      await createMutation.mutateAsync(data);
      setCreateDialogOpen(false);
      toast.success(`Đã tạo ${config.displayName}.`);
      void refetchRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      throw err;
    }
  };

  const handleColumnFilterModeChange = (fieldKey: string, mode: ColumnFilterMode) => {
    setColumnFilters((prev) => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        mode,
        value: prev[fieldKey]?.value ?? "",
      },
    }));
    if (v2) setPage(1);
  };

  const handleColumnFilterValueChange = (fieldKey: string, value: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        mode: prev[fieldKey]?.mode ?? DEFAULT_COLUMN_FILTER_MODE,
        value,
      },
    }));
    if (v2) setPage(1);
  };

  const handleColumnFilterRangeChange = (
    fieldKey: string,
    part: "from" | "to",
    value: string,
  ) => {
    setColumnFilters((prev) => ({
      ...prev,
      [fieldKey]: {
        mode: prev[fieldKey]?.mode ?? DEFAULT_COLUMN_FILTER_MODE,
        value: prev[fieldKey]?.value ?? "",
        from: part === "from" ? value : prev[fieldKey]?.from,
        to: part === "to" ? value : prev[fieldKey]?.to,
      },
    }));
    if (v2) setPage(1);
  };

  const selectedRecord = selectedRows.length === 1 ? selectedRows[0] : null;
  const areAllVisibleSelected =
    filteredRecords.length > 0 &&
    selectedRows.length === filteredRecords.length;

  const openDuplicateDialog = () => {
    if (!selectedRecord) return;
    setDuplicateSnapshot({ ...selectedRecord });
  };

  const openCategoryEditDialog = () => {
    if (!selectedRecord) return;
    setEditSnapshot({ ...selectedRecord });
  };

  const handleRowClick = (row: Record<string, unknown>) => {
    if (disableRowClick) return;
    if (entityKey === "inventory-item-categories") {
      setSelectedRecordIds(new Set([String(row[config.idField])]));
      return;
    }
    navigate(`/admin/${entityKey}/${String(row[config.idField])}`);
  };

  const handleDuplicateSubmit = async (data: Record<string, unknown>) => {
    try {
      await createMutation.mutateAsync(data);
      setDuplicateSnapshot(null);
      toast.success(`Đã nhân bản ${config.displayName}.`);
      void refetchRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      throw err;
    }
  };

  const handleEditSubmit = async (data: Record<string, unknown>) => {
    if (!editSnapshot) return;
    try {
      await updateMutation.mutateAsync({
        id: String(editSnapshot[config.idField]),
        body: data,
      });
      setEditSnapshot(null);
      setSelectedRecordIds(new Set());
      toast.success(`Đã cập nhật ${config.displayName}.`);
      void refetchRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      throw err;
    }
  };

  const handleDeleteSelected = () => {
    if (selectedRows.length === 0) return;
    setDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (selectedRows.length === 0) return;
    const rowsToDelete = selectedRows;
    setDeleteDialogOpen(false);
    try {
      await Promise.all(
        rowsToDelete.map((record) =>
          deleteMutation.mutateAsync(String(record[config.idField])),
        ),
      );
      setSelectedRecordIds(new Set());
      toast.success(`Đã xoá ${rowsToDelete.length} bản ghi.`);
      void refetchRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
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
          if (entityKey === "inventory-item-categories") {
            openCategoryEditDialog();
            return;
          }
          if (useDialogMode) {
            openEditDialog(id);
            return;
          }
          void goToEdit(id);
        },
        handleDeleteSelected: () => void handleDeleteSelected(),
        refetchRecords,
        navigate: (to) => void navigate(to),
        onImportInventory: inventoryConfig?.onImportInventory
          ? () => inventoryConfig.onImportInventory?.(inventoryActionContext)
          : undefined,
        onExportInventory: inventoryConfig
          ? () => inventoryConfig.onExportInventoryAll?.(inventoryActionContext)
          : undefined,
        onExportInventoryAll: inventoryConfig
          ? () => inventoryConfig.onExportInventoryAll?.(inventoryActionContext)
          : undefined,
        onExportInventorySelected: inventoryConfig?.onExportInventorySelected
          ? () =>
              inventoryConfig.onExportInventorySelected?.(
                inventoryActionContext,
              )
          : undefined,
        exportInventoryOptions,
      },
      {
        selectedRecord,
        selectedCount: selectedRows.length,
      },
    ),
  );

  // Tree view gets expand-all / collapse-all actions appended to the toolbar.
  if (isCategoryTree) {
    toolbarItems.push(
      {
        id: "category-expand-all",
        label: "Mở rộng",
        icon: ChevronsUpDown,
        onClick: () => setCollapsedIds(new Set()),
      },
      {
        id: "category-collapse-all",
        label: "Thu gọn",
        icon: ChevronsDownUp,
        onClick: () => setCollapsedIds(new Set(collectParentIds(treeNodes))),
      },
    );
  }

  const breadcrumbs = resolveBackofficeBreadcrumbs(location.pathname);

  return (
    <AdminPageShell>
      <PageHeader
        className="mb-2"
        title={config.displayName}
        breadcrumbs={breadcrumbs}
      />
      <TableActionHeader className="shrink-0" items={toolbarItems} />

      <BaseDataTable
        columns={tableColumns}
        rows={filteredRecords}
        loading={loading}
        emptyLabel="Không có bản ghi."
        getRowKey={(row) => String(row[config.idField])}
        onRowClick={handleRowClick}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={v2 ? undefined : handleSort}
        columnFilterControl={{
          filters: columnFilters,
          onModeChange: handleColumnFilterModeChange,
          onValueChange: handleColumnFilterValueChange,
          onRangeChange: handleColumnFilterRangeChange,
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
          isCategoryTree ? null : records && !loading ? (
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

      {createDialogOpen && (
        <CrudFormDialog
          config={config}
          record={null}
          onSubmit={handleCreateSubmit}
          onClose={() => setCreateDialogOpen(false)}
        />
      )}

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

      {editSnapshot && (
        <CrudFormDialog
          key={String(editSnapshot[config.idField] ?? "edit")}
          config={config}
          record={editSnapshot}
          onSubmit={handleEditSubmit}
          onClose={() => setEditSnapshot(null)}
        />
      )}

      {inventoryConfig?.renderDialogs?.(inventoryActionContext)}

      {useDialogMode && entityKey && (
        <CrudRecordDialog
          entityKey={entityKey}
          recordId={crudDialogRecordId}
          open={crudDialogOpen}
          onClose={() => setCrudDialogOpen(false)}
          onSuccess={() => {
            void refetchRecords();
            onRecordSaved?.();
          }}
        />
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xoá</DialogTitle>
            <DialogDescription>{deleteDialogDescription}</DialogDescription>
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
  entityKey?: string,
): React.ReactNode {
  if (value === null || value === undefined) return "—";
  if (entityKey === "inventory-items" && field.key === "isActive") {
    const enabled = Boolean(value);
    return (
      <span
        className={
          enabled
            ? "inline-flex items-center rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-300"
            : "inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        }
      >
        {enabled ? "Đang hoạt động" : "Ngừng kinh doanh"}
      </span>
    );
  }
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
  if (field.type === "enum") return formatCrudFieldValue(value, field);
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
