import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import type {
  CrudEntityConfig,
  PaginatedResponse,
  FieldDefinition,
} from "@erp/shared-interfaces";
import { useCrudApi } from "./useCrudApi";
import { CrudFormDialog } from "./CrudFormDialog";
import { CrudDetailView } from "./CrudDetailView";

export function CrudListPage() {
  const { entityKey } = useParams<{ entityKey: string }>();
  const {
    config,
    loading: configLoading,
    error: configError,
    fetchRecords,
    createRecord,
    updateRecord,
    deleteRecord,
  } = useCrudApi(entityKey!);

  const [records, setRecords] = useState<PaginatedResponse<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(false);
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

  const reload = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      const result = await fetchRecords({
        page,
        pageSize,
        sortBy,
        sortOrder,
        search,
        filters,
      });
      setRecords(result);
    } finally {
      setLoading(false);
    }
  }, [config, fetchRecords, page, pageSize, sortBy, sortOrder, search, filters]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
    setRecords(null);
    setSortBy(undefined);
    setSortOrder("desc");
    setSearch("");
    setSearchInput("");
    setFilters({});
  }, [entityKey]);

  if (configLoading) return <PageShell><p>Loading configuration…</p></PageShell>;
  if (configError) return <PageShell><p style={{ color: "var(--danger)" }}>Error: {configError}</p></PageShell>;
  if (!config) return <PageShell><p>Entity not found.</p></PageShell>;

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
    if (!window.confirm(`Delete this ${config.displayName}?`)) return;
    await deleteRecord(id);
    reload();
  };

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    if (editingRecord) {
      await updateRecord(String(editingRecord[config.idField]), data);
    } else {
      await createRecord(data);
    }
    setFormOpen(false);
    reload();
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
      <div style={styles.header}>
        <h1 style={styles.title}>{config.displayName}</h1>
        <button style={styles.btnPrimary} onClick={handleCreate}>
          + New
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearchSubmit} style={styles.searchRow}>
        <input
          style={styles.searchInput}
          type="text"
          placeholder={`Search ${config.displayName}…`}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button type="submit" style={styles.btnSecondary}>
          Search
        </button>
      </form>

      {/* Filters */}
      {config.filterDefinitions.length > 0 && (
        <div style={styles.filterRow}>
          {config.filterDefinitions.map((fd) => (
            <label key={fd.key} style={styles.filterLabel}>
              {fd.label}
              {fd.type === "select" && fd.options ? (
                <select
                  style={styles.filterSelect}
                  value={String(filters[fd.key] ?? "")}
                  onChange={(e) => handleFilterChange(fd.key, e.target.value)}
                >
                  <option value="">All</option>
                  {fd.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : fd.type === "boolean" ? (
                <select
                  style={styles.filterSelect}
                  value={String(filters[fd.key] ?? "")}
                  onChange={(e) => handleFilterChange(fd.key, e.target.value)}
                >
                  <option value="">All</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  style={styles.filterInput}
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
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {config.fields.map((f) => (
                <Th key={f.key} field={f} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              ))}
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={config.fields.length + 1} style={styles.tdCenter}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && records && records.data.length === 0 && (
              <tr>
                <td colSpan={config.fields.length + 1} style={styles.tdCenter}>
                  No records found.
                </td>
              </tr>
            )}
            {!loading &&
              records?.data.map((rec) => (
                <tr key={String(rec[config.idField])} style={styles.tr}>
                  {config.fields.map((f) => (
                    <td key={f.key} style={styles.td}>
                      {formatCell(rec[f.key], f)}
                    </td>
                  ))}
                  <td style={styles.td}>
                    <button style={styles.btnLink} onClick={() => setDetailRecord(rec)}>
                      View
                    </button>
                    <button style={styles.btnLink} onClick={() => handleEdit(rec)}>
                      Edit
                    </button>
                    <button
                      style={{ ...styles.btnLink, color: "var(--danger, #d32f2f)" }}
                      onClick={() => handleDelete(rec)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            style={styles.btnSecondary}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span style={styles.pageInfo}>
            Page {page} of {totalPages} ({records?.total} records)
          </span>
          <button
            style={styles.btnSecondary}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
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
  return <div style={styles.page}>{children}</div>;
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
    <th style={styles.th} onClick={() => onSort(field.key)}>
      <span style={{ cursor: "pointer", userSelect: "none" }}>
        {field.label}
        {active ? (sortOrder === "asc" ? " ▲" : " ▼") : ""}
      </span>
    </th>
  );
}

function formatCell(value: unknown, field: FieldDefinition): string {
  if (value === null || value === undefined) return "—";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "date") {
    try {
      return new Date(String(value)).toLocaleDateString();
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "24px 16px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { margin: 0, fontSize: 24, fontWeight: 600 },
  searchRow: { display: "flex", gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1,
    padding: "8px 12px",
    fontSize: 14,
    border: "1px solid #d0d5dd",
    borderRadius: 6,
    outline: "none",
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  filterLabel: { display: "flex", flexDirection: "column", fontSize: 12, gap: 4 },
  filterSelect: { padding: "6px 8px", borderRadius: 4, border: "1px solid #d0d5dd" },
  filterInput: { padding: "6px 8px", borderRadius: 4, border: "1px solid #d0d5dd", width: 140 },
  tableWrap: { overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "2px solid #e4e7ec",
    background: "#f9fafb",
    fontWeight: 600,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #f2f4f7" },
  td: { padding: "10px 12px", verticalAlign: "middle" },
  tdCenter: { padding: "24px 12px", textAlign: "center", color: "#667085" },
  pagination: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    marginTop: 16,
  },
  pageInfo: { fontSize: 13, color: "#667085" },
  btnPrimary: {
    padding: "8px 16px",
    background: "#1570ef",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "6px 14px",
    background: "#fff",
    color: "#344054",
    border: "1px solid #d0d5dd",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  },
  btnLink: {
    background: "none",
    border: "none",
    color: "#1570ef",
    fontSize: 13,
    cursor: "pointer",
    padding: "2px 6px",
    textDecoration: "underline",
  },
};
