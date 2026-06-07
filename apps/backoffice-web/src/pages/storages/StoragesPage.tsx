import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CrudEntityConfig,
  FieldDefinition,
  PaginatedResponse,
} from "@erp/shared-interfaces";
import { formatClientError } from "@erp/api-client";
import {
  AppModal,
  Button,
  DocumentListShell,
  FormField,
  Input,
  PageToolbar,
  type ToolbarItem,
} from "@erp/ui";
import { Plus, RefreshCw } from "lucide-react";
import { erpApi } from "../../lib/erp-api";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { PaginationControls } from "../../components/table/PaginationControls";
import { InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import { buildV2Body, type V2SearchConfig } from "../../components/crud/crudV2Search";

const ENTITY_KEY = "inventory-storages";

/** Server-side v2 search config — filter keys align 1:1 with the search DTO. */
const STORAGE_SEARCH: V2SearchConfig = {
  path: "/v2/inventory-storages/search",
  fields: {
    name: "string",
    isMainStorage: "boolean",
  },
};

const FILTER_KEYS = ["name", "isMainStorage"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce((acc, k) => {
    acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
    return acc;
  }, {} as Record<FilterKey, ColumnFilter>);
}

type RowData = Record<string, unknown>;

type SubTab = "count" | "branches";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "count", label: "Số lượng kho" },
  { id: "branches", label: "Chi nhánh kho" },
];

export function StoragesPage() {
  const [subTab, setSubTab] = useState<SubTab>("count");
  const [config, setConfig] = useState<CrudEntityConfig | null>(null);
  const [records, setRecords] = useState<PaginatedResponse<RowData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationStateDto>({
    ...DEFAULT_PAGINATION,
    sortBy: "name",
    sortOrder: "asc",
  });
  const [editingRecord, setEditingRecord] = useState<RowData | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RowData | null>(null);
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);

  // Re-sort when switching tab so each view emphasises its own dimension.
  useEffect(() => {
    setPagination((prev) => ({
      ...prev,
      page: 1,
      sortBy: subTab === "branches" ? "branchId" : "name",
      sortOrder: "asc",
    }));
  }, [subTab]);

  const loadConfig = useCallback(async () => {
    const { data, error } = await erpApi.GET("/admin/entities/{entityKey}", {
      params: { path: { entityKey: ENTITY_KEY } },
    });
    if (error) {
      setError(formatClientError(error));
      return;
    }
    setConfig(data as unknown as CrudEntityConfig);
    setError(null);
  }, []);

  const loadRecords = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try {
      // Sort is server-side now: the sub-tab drives sortBy ('name' | 'branchId').
      const body = {
        ...buildV2Body(
          STORAGE_SEARCH,
          columnFilters as unknown as Record<string, ColumnFilter>,
          pagination.page,
          pagination.pageSize,
        ),
        sortBy: pagination.sortBy,
        sortOrder: pagination.sortOrder,
      };
      const { data } = await apiClient.post<{
        data: RowData[];
        total: number;
        page: number;
        limit: number;
      }>(STORAGE_SEARCH.path, body);
      setRecords({
        data: data.data,
        total: data.total,
        page: data.page,
        pageSize: data.limit,
      });
      setError(null);
    } catch (err) {
      setError(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [config, pagination, columnFilters]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    // Debounce so rapid filter typing settles into a single request.
    const t = setTimeout(() => void loadRecords(), 300);
    return () => clearTimeout(t);
  }, [loadRecords]);

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
    }),
    [columnFilters, resetPage],
  );

  const columns = useMemo<TableColumn<RowData>[]>(() => {
    if (!config) return [];
    // For "Chi nhánh kho" tab, lead with branchId so the branch dimension is
    // emphasised; for "Số lượng kho" use the default ordering.
    const fields = subTab === "branches"
      ? [...config.fields].sort((a, b) => {
          if (a.key === "branchId") return -1;
          if (b.key === "branchId") return 1;
          return 0;
        })
      : config.fields;
    return fields.map((field) => {
      const column: TableColumn<RowData> = {
        key: field.key,
        label: field.label,
        render: (row) => formatCell(row[field.key], field),
      };
      // Only `name` and `isMainStorage` map to a server-side filter; everything
      // else renders an empty (non-filterable) cell.
      if (field.key === "name") {
        column.filterKind = "symbol";
      } else if (field.key === "isMainStorage") {
        column.filterKind = "select";
        column.filterOptions = [
          { value: "true", label: "Có" },
          { value: "false", label: "Không" },
        ];
      } else {
        column.filterKind = "none";
      }
      return column;
    });
  }, [config, subTab]);

  const summary = useMemo(() => {
    if (!records) return null;
    if (subTab === "branches") {
      const branches = new Set(
        records.data
          .map((row) => row.branchId)
          .filter((value): value is string | number => value !== null && value !== undefined)
          .map(String),
      );
      return `Số chi nhánh có kho: ${branches.size} · Tổng kho: ${records.total}`;
    }
    return `Tổng số kho: ${records.total}`;
  }, [records, subTab]);

  const saveRecord = useCallback(
    async (payload: RowData) => {
      if (!config) return;
      setSaving(true);
      try {
        if (editingRecord) {
          const id = String(editingRecord[config.idField]);
          const { error } = await erpApi.PATCH(
            "/admin/entities/{entityKey}/records/{id}",
            {
              params: { path: { entityKey: ENTITY_KEY, id } },
              body: payload,
            },
          );
          if (error) {
            setError(formatClientError(error));
            return;
          }
        } else {
          const { error } = await erpApi.POST(
            "/admin/entities/{entityKey}/records",
            {
              params: { path: { entityKey: ENTITY_KEY } },
              body: payload,
            },
          );
          if (error) {
            setError(formatClientError(error));
            return;
          }
        }
        setFormOpen(false);
        setEditingRecord(null);
        await loadRecords();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Lưu bản ghi thất bại");
      } finally {
        setSaving(false);
      }
    },
    [config, editingRecord, loadRecords],
  );

  const confirmDelete = useCallback(async () => {
    if (!config || !pendingDelete) return;
    const id = String(pendingDelete[config.idField]);
    setSaving(true);
    try {
      const { error } = await erpApi.DELETE(
        "/admin/entities/{entityKey}/records/{id}",
        { params: { path: { entityKey: ENTITY_KEY, id } } },
      );
      if (error) {
        setError(formatClientError(error));
        return;
      }
      setPendingDelete(null);
      await loadRecords();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Xóa bản ghi thất bại");
    } finally {
      setSaving(false);
    }
  }, [config, loadRecords, pendingDelete]);

  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Thêm kho",
      icon: Plus,
      onClick: () => {
        setEditingRecord(null);
        setFormOpen(true);
      },
      disabled: !config,
    },
    {
      id: "refresh",
      label: "Tải lại",
      icon: RefreshCw,
      onClick: () => void loadRecords(),
      disabled: loading,
    },
  ];

  return (
    <>
      <DocumentListShell
        title="Kho lưu trữ"
        tabs={<InventoryTabBar activeId="storages" />}
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
        filters={
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1 rounded-md border bg-background p-0.5 text-sm">
              {SUB_TABS.map((tab) => {
                const active = tab.id === subTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rounded px-3 py-1 transition ${
                      active
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-accent/40"
                    }`}
                    onClick={() => setSubTab(tab.id)}
                    aria-pressed={active}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
            {summary ? (
              <span className="text-sm text-muted-foreground">{summary}</span>
            ) : null}
          </div>
        }
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={records?.total ?? 0}
            onPageChange={(nextPage) =>
              setPagination((prev) => ({ ...prev, page: nextPage }))
            }
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: nextPageSize }))
            }
            onRefresh={() => void loadRecords()}
          />
        }
      >
        {error ? (
          <p className="px-4 py-2 text-sm text-destructive">{error}</p>
        ) : null}
        <BaseDataTable
          columns={columns}
          rows={records?.data ?? []}
          loading={loading}
          emptyLabel="Chưa có kho nào."
          getRowKey={(row, index) =>
            String((config && row[config.idField]) ?? `row-${index}`)
          }
          columnFilterControl={columnFilterControl}
          renderActions={(row) => (
            <div className="flex gap-2">
              <Button
                variant="link"
                size="sm"
                className="h-auto px-1 py-0.5"
                onClick={() => {
                  setEditingRecord(row);
                  setFormOpen(true);
                }}
              >
                Sửa
              </Button>
              <Button
                variant="link"
                size="sm"
                className="h-auto px-1 py-0.5 text-destructive"
                onClick={() => setPendingDelete(row)}
              >
                Xóa
              </Button>
            </div>
          )}
        />
      </DocumentListShell>

      {formOpen && config ? (
        <StorageRecordFormModal
          config={config}
          saving={saving}
          record={editingRecord}
          onCancel={() => {
            setFormOpen(false);
            setEditingRecord(null);
          }}
          onSubmit={saveRecord}
        />
      ) : null}

      {pendingDelete && config ? (
        <ConfirmActionModal
          title={`Xóa ${config.displayName}`}
          message="Thao tác này không thể hoàn tác. Xác nhận xóa kho này?"
          confirmLabel="Xóa"
          cancelLabel="Huỷ"
          loading={saving}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </>
  );
}

function StorageRecordFormModal({
  config,
  record,
  saving,
  onSubmit,
  onCancel,
}: {
  config: CrudEntityConfig;
  record: RowData | null;
  saving: boolean;
  onSubmit: (payload: RowData) => Promise<void>;
  onCancel: () => void;
}) {
  const editableFields = config.fields.filter(
    (field) =>
      !field.readOnly &&
      field.key !== config.idField &&
      field.key !== "createdAt" &&
      field.key !== "updatedAt",
  );

  const [values, setValues] = useState<RowData>(() => {
    if (record) return { ...record };
    const initial: RowData = {};
    editableFields.forEach((field) => {
      initial[field.key] = field.type === "boolean" ? false : "";
    });
    return initial;
  });

  const formRef = useRef<HTMLFormElement>(null);

  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={`${record ? "Sửa" : "Thêm"} ${config.displayName}`}
      onSave={() => formRef.current?.requestSubmit()}
      onCancel={onCancel}
      saveLabel={saving ? "Đang lưu…" : "Lưu"}
      saveDisabled={saving}
      className="max-w-[560px]"
    >
      <form
        ref={formRef}
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(buildPayload(values, editableFields));
        }}
      >
        {editableFields.map((field) => (
          <FormField key={field.key} label={field.label}>
            <FieldInput
              field={field}
              value={values[field.key]}
              onChange={(value) =>
                setValues((prev) => ({ ...prev, [field.key]: value }))
              }
            />
          </FormField>
        ))}
      </form>
    </AppModal>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 cursor-pointer rounded border-2 border-input accent-primary"
      />
    );
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(event) =>
          onChange(event.target.value === "" ? "" : Number(event.target.value))
        }
      />
    );
  }
  return (
    <Input
      type="text"
      value={String(value ?? "")}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function buildPayload(values: RowData, fields: FieldDefinition[]): RowData {
  const payload: RowData = {};
  fields.forEach((field) => {
    payload[field.key] = values[field.key];
  });
  return payload;
}

function formatCell(value: unknown, field: FieldDefinition): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        disabled
        readOnly
        className="h-5 w-5 cursor-default rounded border-2 border-input accent-primary disabled:opacity-70"
      />
    );
  }
  if (field.type === "date") {
    try {
      return new Date(String(value)).toLocaleString("vi-VN");
    } catch {
      return String(value);
    }
  }
  return String(value);
}
