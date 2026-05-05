import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import type {
  CrudEntityConfig,
  FieldDefinition,
} from "@erp/shared-interfaces";
import { Button, formatMoneyInteger, Input } from "@erp/ui";
import {
  useCrudConfig,
  useCrudRecords,
  useCrudCreate,
  useCrudUpdate,
  useCrudDelete,
} from "./useCrudApi";
import { CrudFormDialog } from "./CrudFormDialog";
import { CrudDetailView } from "./CrudDetailView";
import { formatCustomerStatus } from "../../lib/customer-display";

export function CrudListPage() {
  const { entityKey } = useParams<{ entityKey: string }>();

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<Record<string, unknown>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [detailRecord, setDetailRecord] = useState<Record<string, unknown> | null>(null);

  const { data: config, isLoading: configLoading, error: configError } = useCrudConfig(entityKey!);

  const {
    data: records,
    isLoading: loading,
  } = useCrudRecords(
    entityKey!,
    { page, pageSize, sortBy, sortOrder, search, filters },
    !!config,
  );

  const createMutation = useCrudCreate(entityKey!);
  const updateMutation = useCrudUpdate(entityKey!);
  const deleteMutation = useCrudDelete(entityKey!);

  useEffect(() => {
    setPage(1);
    setSortBy(undefined);
    setSortOrder("desc");
    setSearch("");
    setSearchInput("");
    setFilters({});
  }, [entityKey]);

  if (configLoading) return <PageShell><p>Đang tải cấu hình…</p></PageShell>;
  if (configError) return <PageShell><p className="text-destructive">Lỗi: {configError instanceof Error ? configError.message : "Không tải được"}</p></PageShell>;
  if (!config) return <PageShell><p>Không tìm thấy thực thể.</p></PageShell>;

  const totalPages = records ? Math.ceil(records.total / pageSize) : 0;

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
    setEditingRecord(null);
    setFormOpen(true);
  };

  const handleEdit = (rec: Record<string, unknown>) => {
    setEditingRecord(rec);
    setFormOpen(true);
  };

  const handleDelete = async (rec: Record<string, unknown>) => {
    const id = String(rec[config.idField]);
    if (!window.confirm(`Xoá ${config.displayName} này?`)) return;
    await deleteMutation.mutateAsync(id);
  };

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    if (editingRecord) {
      await updateMutation.mutateAsync({
        id: String(editingRecord[config.idField]),
        body: data,
      });
    } else {
      await createMutation.mutateAsync(data);
    }
    setFormOpen(false);
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

  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{config.displayName}</h1>
        <Button onClick={handleCreate}>+ Thêm mới</Button>
      </div>

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

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {config.fields.map((f) => (
                <Th key={f.key} field={f} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              ))}
              <th className="whitespace-nowrap border-b-2 border-border bg-muted/50 px-3 py-2.5 text-left text-xs font-semibold">
                Thao tác
              </th>
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
            {!loading && records && records.data.length === 0 && (
              <tr>
                <td colSpan={config.fields.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  Không có bản ghi.
                </td>
              </tr>
            )}
            {!loading &&
              records?.data.map((rec) => (
                <tr key={String(rec[config.idField])} className="border-b border-border/50">
                  {config.fields.map((f) => (
                    <td key={f.key} className="px-3 py-2.5 align-middle">
                      {formatCell(rec[f.key], f)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 align-middle">
                    <Button variant="link" size="sm" className="h-auto px-1 py-0" onClick={() => setDetailRecord(rec)}>
                      Xem
                    </Button>
                    <Button variant="link" size="sm" className="h-auto px-1 py-0" onClick={() => handleEdit(rec)}>
                      Sửa
                    </Button>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto px-1 py-0 text-destructive"
                      onClick={() => handleDelete(rec)}
                    >
                      Xoá
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Trước
          </Button>
          <span className="text-xs text-muted-foreground">
            Trang {page} / {totalPages} ({records?.total} bản ghi)
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      )}

      {/* Form Dialog */}
      {formOpen && (
        <CrudFormDialog
          config={config}
          record={editingRecord}
          onSubmit={handleFormSubmit}
          onClose={() => setFormOpen(false)}
        />
      )}

      {/* Detail View */}
      {detailRecord && (
        <CrudDetailView
          config={config}
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
        />
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1200px] px-4 py-6">{children}</div>;
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
      className="whitespace-nowrap border-b-2 border-border bg-muted/50 px-3 py-2.5 text-left text-xs font-semibold"
      onClick={() => onSort(field.key)}
    >
      <span className="cursor-pointer select-none">
        {field.label}
        {active ? (sortOrder === "asc" ? " ▲" : " ▼") : ""}
      </span>
    </th>
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
  if (field.type === "number" && field.numberFormat === "money") {
    const n = Number(value);
    return Number.isFinite(n) ? formatMoneyInteger(n) : String(value);
  }
  return String(value);
}
