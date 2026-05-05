import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  FieldDefinition,
} from "@erp/shared-interfaces";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@erp/ui";
import { buildCrudEntityToolbarSpecs, buildListToolbar } from "../../lib/list-toolbar";
import { isNotFoundHttpError } from "../../lib/not-found-http-error";
import { HttpErrorView } from "../../pages/errors/HttpErrorPage";
import {
  applyColumnFilter,
  DEFAULT_COLUMN_FILTER_MODE,
  resolveColumnWidthVariant,
  TABLE_COLUMN_WIDTH_PX,
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
import { formatCustomerStatus } from "../../lib/customer-display";
import { AdminPageShell } from "../layout/AdminPageShell";
import { TableActionHeader } from "../layout/TableActionHeader";
import { resolveBackofficeBreadcrumbs } from "../layout/breadcrumbs";

export function CrudListPage() {
  const { entityKey } = useParams<{ entityKey: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>(
    {},
  );

  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [duplicateSnapshot, setDuplicateSnapshot] = useState<Record<string, unknown> | null>(null);

  const { data: config, isLoading: configLoading, error: configError } = useCrudConfig(entityKey!);

  const {
    data: records,
    isLoading: loading,
    refetch: refetchRecords,
  } = useCrudRecords(
    entityKey!,
    { page, pageSize, sortBy, sortOrder, search, filters: {} },
    !!config,
  );

  const createMutation = useCrudCreate(entityKey!);
  const deleteMutation = useCrudDelete(entityKey!);

  useEffect(() => {
    setPage(1);
    setPageSize(20);
    setSortBy(undefined);
    setSortOrder("desc");
    setSearch("");
    setSearchInput("");
    setColumnFilters({});
    setSelectedRecordIds(new Set());
    setDuplicateSnapshot(null);
  }, [entityKey]);

  useEffect(() => {
    if (!records) {
      setSelectedRecordIds(new Set());
      return;
    }
    const idField = config?.idField ?? "id";
    const availableIds = new Set(records.data.map((record) => String(record[idField])));
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
    const visibleIds = new Set(filteredRecords.map((record) => String(record[config?.idField ?? "id"])));
    setSelectedRecordIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRecords, config?.idField]);

  const tableColumns = useMemo<TableColumn<Record<string, unknown>>[]>(
    () =>
      (config?.fields ?? []).map((field) => {
        const widthVariant = resolveColumnWidthVariant(entityKey!, field);
        const widthPx = TABLE_COLUMN_WIDTH_PX[widthVariant];
        return {
          key: field.key,
          label: field.label,
          width: widthPx,
          headerClassName: `w-[${widthPx}px] min-w-[${widthPx}px]`,
          className: `max-w-[${widthPx}px]`,
          render: (row) => formatCell(row[field.key], field),
        };
      }),
    [config?.fields, entityKey],
  );

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
          Lỗi: {configError instanceof Error ? configError.message : "Không tải được"}
        </p>
      </AdminPageShell>
    );
  }
  if (!config) {
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
    navigate(`/admin/${entityKey}/new`);
  };

  const handleColumnFilterModeChange = (fieldKey: string, mode: ColumnFilterMode) => {
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

  const selectedRows = filteredRecords.filter((record) =>
    selectedRecordIds.has(String(record[config.idField])),
  );
  const selectedRecord = selectedRows.length === 1 ? selectedRows[0] : null;
  const areAllVisibleSelected =
    filteredRecords.length > 0 && selectedRows.length === filteredRecords.length;

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
      entityKey!,
      {
        handleCreate,
        openDuplicateDialog,
        handleEdit: () => {
          if (!selectedRecord) return;
          void navigate(`/admin/${entityKey}/${String(selectedRecord[config.idField])}/edit`);
        },
        handleDeleteSelected: () => void handleDeleteSelected(),
        refetchRecords,
        navigate: (to) => void navigate(to),
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
        onRowClick={(row) => navigate(`/admin/${entityKey}/${String(row[config.idField])}`)}
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
                    new Set(filteredRecords.map((record) => String(record[config.idField]))),
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

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xoá</DialogTitle>
            <DialogDescription>
              Xoá {selectedRows.length} bản ghi đã chọn? Thao tác này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
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

function formatCell(value: unknown, field: FieldDefinition): React.ReactNode {
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
  if (field.key === "status") return formatCustomerStatus(value);
  if (field.type === "date") {
    try {
      return new Date(String(value)).toLocaleDateString("vi-VN");
    } catch {
      return String(value);
    }
  }
  return String(value);
}
