import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type {
  CrudEntityConfig,
  FieldDefinition,
} from "@erp/shared-interfaces";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  type ToolbarItem,
} from "@erp/ui";
import {
  useCrudConfig,
  useCrudRecords,
  useCrudCreate,
  useCrudDelete,
} from "./useCrudApi";
import { CrudFormDialog } from "./CrudFormDialog";
import { formatCustomerStatus } from "../../lib/customer-display";
import { TableActionHeader } from "../layout/TableActionHeader";
import { resolveBackofficeBreadcrumbs } from "../layout/breadcrumbs";

type ColumnFilterMode =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "notContains";

interface ColumnFilter {
  mode: ColumnFilterMode;
  value: string;
}

const DEFAULT_FILTER_MODE: ColumnFilterMode = "contains";

const COLUMN_FILTER_MODE_OPTIONS: Array<{ value: ColumnFilterMode; label: string }> = [
  { value: "contains", label: "Chứa" },
  { value: "equals", label: "Bằng" },
  { value: "startsWith", label: "Bắt đầu bằng" },
  { value: "endsWith", label: "Kết thúc bằng" },
  { value: "notContains", label: "Không chứa" },
];

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

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
  const [filters, setFilters] = useState<Record<string, unknown>>({});
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
    { page, pageSize, sortBy, sortOrder, search, filters },
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
    setFilters({});
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

  if (configLoading) return <PageShell><p>Đang tải cấu hình…</p></PageShell>;
  if (configError) return <PageShell><p className="text-destructive">Lỗi: {configError instanceof Error ? configError.message : "Không tải được"}</p></PageShell>;
  if (!config) return <PageShell><p>Không tìm thấy thực thể.</p></PageShell>;

  const total = records?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

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

  const handleFilterChange = (key: string, value: unknown) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === "" || value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
    setPage(1);
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
        mode: prev[fieldKey]?.mode ?? DEFAULT_FILTER_MODE,
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

  const toolbarItems: ToolbarItem[] = [
    { id: "create", label: "Thêm mới", icon: Plus, onClick: handleCreate },
    { id: "duplicate", label: "Nhân bản", icon: Copy, onClick: openDuplicateDialog, disabled: !selectedRecord },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      onClick: () =>
        selectedRecord &&
        navigate(`/admin/${entityKey}/${String(selectedRecord[config.idField])}/edit`),
      disabled: !selectedRecord,
    },
    { id: "delete", label: "Xoá", icon: Trash2, onClick: () => void handleDeleteSelected(), disabled: selectedRows.length === 0, variant: "danger" },
  ];

  const breadcrumbs = resolveBackofficeBreadcrumbs(location.pathname);

  return (
    <PageShell>
      <div className="mb-2">
        <h1 className="text-2xl font-semibold">{config.displayName}</h1>
      </div>

      <TableActionHeader
        className="mb-3"
        breadcrumbs={breadcrumbs}
        items={toolbarItems}
      />

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="mb-3 flex gap-2">
        <Input
          className="flex-1"
          type="text"
          placeholder={`Tìm ${config.displayName}…`}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Button type="submit" variant="outline">
          Tìm
        </Button>
      </form>

      {/* Filters */}
      {config.filterDefinitions.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {config.filterDefinitions.map((fd) => (
            <label key={fd.key} className="flex flex-col gap-1 text-xs">
              {fd.label}
              {fd.type === "select" && fd.options ? (
                <select
                  className="rounded border border-input px-2 py-1.5 text-sm"
                  value={String(filters[fd.key] ?? "")}
                  onChange={(e) => handleFilterChange(fd.key, e.target.value)}
                >
                  <option value="">Tất cả</option>
                  {fd.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : fd.type === "boolean" ? (
                <select
                  className="rounded border border-input px-2 py-1.5 text-sm"
                  value={String(filters[fd.key] ?? "")}
                  onChange={(e) => handleFilterChange(fd.key, e.target.value)}
                >
                  <option value="">Tất cả</option>
                  <option value="true">Có</option>
                  <option value="false">Không</option>
                </select>
              ) : (
                <Input
                  className="h-8 w-36 text-sm"
                  type="text"
                  value={String(filters[fd.key] ?? "")}
                  onChange={(e) => handleFilterChange(fd.key, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full border-collapse text-base [&_td]:border [&_td]:border-border [&_th]:border [&_th]:border-border">
          <thead>
            <tr>
              <th className="sticky top-0 z-20 w-10 border-b-2 border-border bg-muted px-2 py-2.5 text-center">
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
              </th>
              {config.fields.map((f) => (
                <Th key={f.key} field={f} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              ))}
            </tr>
            <tr>
              <th className="sticky top-12 z-20 border-b border-border bg-white px-2 py-1 text-left text-xs text-muted-foreground">
                Chọn
              </th>
              {config.fields.map((field) => {
                const activeFilter = columnFilters[field.key];
                return (
                  <th
                    key={`${field.key}-filter`}
                    className="sticky top-12 z-20 border-b border-border bg-white px-2 py-1 align-top"
                  >
                    <div className="flex min-w-[190px] items-center gap-1">
                      <select
                        className="h-7 w-[110px] rounded border border-input bg-background px-1 text-xs font-medium"
                        value={activeFilter?.mode ?? DEFAULT_FILTER_MODE}
                        onChange={(event) =>
                          handleColumnFilterModeChange(
                            field.key,
                            event.target.value as ColumnFilterMode,
                          )
                        }
                      >
                        {COLUMN_FILTER_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        className="h-7 min-w-0 flex-1 text-xs"
                        placeholder="Giá trị..."
                        value={activeFilter?.value ?? ""}
                        onChange={(event) =>
                          handleColumnFilterValueChange(field.key, event.target.value)
                        }
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={config.fields.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  Đang tải…
                </td>
              </tr>
            )}
            {!loading && filteredRecords.length === 0 && (
              <tr>
                <td colSpan={config.fields.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  Không có bản ghi.
                </td>
              </tr>
            )}
            {!loading &&
              filteredRecords.map((rec) => (
                <tr
                  key={String(rec[config.idField])}
                  className={
                    selectedRecordIds.has(String(rec[config.idField]))
                      ? "cursor-pointer bg-accent/40 hover:bg-accent/50"
                      : "cursor-pointer hover:bg-accent/20"
                  }
                  onClick={() => navigate(`/admin/${entityKey}/${String(rec[config.idField])}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/admin/${entityKey}/${String(rec[config.idField])}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`Mở chi tiết bản ghi ${String(rec[config.idField])}`}
                >
                  <td
                    className="px-2 py-2.5 text-center align-middle"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRecordIds.has(String(rec[config.idField]))}
                      onChange={(event) => {
                        event.stopPropagation();
                        const id = String(rec[config.idField]);
                        setSelectedRecordIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                  {config.fields.map((f) => (
                    <td key={f.key} className="px-3 py-2.5 align-middle">
                      {formatCell(rec[f.key], f)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
          </table>
        </div>

        {records && !loading && (
          <div className="flex flex-col gap-1.5 border-t border-border bg-background px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded-sm p-0"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  aria-label="Trang đầu"
                >
                  <ChevronsLeft className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded-sm p-0"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-foreground">
                <span>Trang</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={totalPages}
                  aria-label="Số trang"
                  className="h-8 w-12 rounded-sm border border-input bg-background px-1 text-center text-sm tabular-nums outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  value={page}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") return;
                    const next = Number.parseInt(raw, 10);
                    if (!Number.isFinite(next)) return;
                    setPage(Math.min(Math.max(1, next), totalPages));
                  }}
                />
                <span className="text-muted-foreground">trên {totalPages}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded-sm p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Trang sau"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded-sm p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  aria-label="Trang cuối"
                >
                  <ChevronsRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 shrink-0 rounded-sm p-0"
                onClick={() => void refetchRecords()}
                aria-label="Tải lại danh sách"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </Button>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="sr-only">Số dòng mỗi trang</span>
                <select
                  className="h-8 rounded-sm border border-input bg-background px-2 text-sm font-medium tabular-nums"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number.parseInt(event.target.value, 10));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-right text-sm text-muted-foreground">
              {total === 0
                ? "Không có kết quả"
                : `Hiển thị ${pageStart} - ${pageEnd} trên ${total.toLocaleString("vi-VN")} kết quả`}
            </p>
          </div>
        )}
      </div>

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
              {deleteMutation.isPending ? "Đang xoá…" : "Xoá"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="w-full px-2 py-6 sm:px-3 lg:px-4">{children}</div>;
}

function Th({
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  field: FieldDefinition;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  const active = sortBy === field.key;
  return (
    <th
      className="sticky top-0 z-20 whitespace-nowrap border-b-2 border-border bg-muted px-3 py-2.5 text-left text-sm font-semibold"
      aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(field.key)}
    >
      <span className="inline-flex cursor-pointer select-none items-center gap-1.5">
        {field.label}
        {active ? (
          sortOrder === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )
        ) : null}
      </span>
    </th>
  );
}

function toComparableText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function applyColumnFilter(comparable: string, filter: ColumnFilter): boolean {
  const haystack = comparable.toLowerCase();
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return true;

  switch (filter.mode) {
    case "contains":
      return haystack.includes(needle);
    case "equals":
      return haystack === needle;
    case "startsWith":
      return haystack.startsWith(needle);
    case "endsWith":
      return haystack.endsWith(needle);
    case "notContains":
      return !haystack.includes(needle);
    default:
      return true;
  }
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
