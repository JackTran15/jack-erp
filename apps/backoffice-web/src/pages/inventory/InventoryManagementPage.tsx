import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CrudEntityConfig,
  FieldDefinition,
  PaginatedResponse,
} from "@erp/shared-interfaces";
import { formatClientError } from "@erp/api-client";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AppModal,
  Button,
  FormField,
  Input,
  MoneyInput,
  formatMoneyInteger,
  type ToolbarItem,
} from "@erp/ui";
import { erpApi } from "../../lib/erp-api";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { PaginationControls } from "../../components/table/PaginationControls";
import { TableActionHeader } from "../../components/layout/TableActionHeader";
import { resolveBackofficeBreadcrumbs } from "../../components/layout/breadcrumbs";
import {
  DEFAULT_PAGINATION,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";

const ENTITY_OPTIONS = [
  { key: "inventory-providers", label: "Nhà cung cấp" },
  { key: "inventory-items", label: "Mặt hàng" },
  { key: "inventory-storages", label: "Kho lưu trữ" },
  { key: "inventory-stock-balances", label: "Tồn kho" },
];

type RowData = Record<string, unknown>;

export function InventoryManagementPage() {
  const [entityKey, setEntityKey] = useState<string>(ENTITY_OPTIONS[0].key);
  const [config, setConfig] = useState<CrudEntityConfig | null>(null);
  const [records, setRecords] = useState<PaginatedResponse<RowData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [pagination, setPagination] =
    useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [editingRecord, setEditingRecord] = useState<RowData | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RowData | null>(null);

  useEffect(() => {
    setConfig(null);
    setRecords(null);
    setError(null);
    setSearchInput("");
    setPagination(DEFAULT_PAGINATION);
  }, [entityKey]);

  const loadConfig = useCallback(async () => {
    const { data, error } = await erpApi.GET("/admin/entities/{entityKey}", {
      params: { path: { entityKey } },
    });
    if (error) {
      setError(formatClientError(error));
      return;
    }
    setConfig(data as unknown as CrudEntityConfig);
    setError(null);
  }, [entityKey]);

  const loadRecords = useCallback(async () => {
    if (!config) return;

    setLoading(true);
    const { data, error } = await erpApi.GET("/admin/entities/{entityKey}/records", {
      params: {
        path: { entityKey },
        query: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          sortBy: pagination.sortBy,
          sortOrder: pagination.sortOrder,
          search: pagination.search || undefined,
        },
      },
    });
    if (error) {
      setError(formatClientError(error));
    } else {
      setRecords(data as unknown as PaginatedResponse<RowData>);
      setError(null);
    }
    setLoading(false);
  }, [config, entityKey, pagination]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const columns = useMemo<TableColumn<RowData>[]>(() => {
    if (!config) return [];
    return config.fields.map((field) => ({
      key: field.key,
      label: field.label,
      render: (row) => formatCell(row[field.key], field),
    }));
  }, [config]);

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
              params: { path: { entityKey, id } },
              body: payload,
            },
          );
          if (error) {
            setError(formatClientError(error));
            return;
          }
        } else {
          const { error } = await erpApi.POST("/admin/entities/{entityKey}/records", {
            params: { path: { entityKey } },
            body: payload,
          });
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
    [config, editingRecord, entityKey, loadRecords],
  );

  const confirmDelete = useCallback(async () => {
    if (!config || !pendingDelete) return;
    const id = String(pendingDelete[config.idField]);
    setSaving(true);
    try {
      const { error } = await erpApi.DELETE(
        "/admin/entities/{entityKey}/records/{id}",
        { params: { path: { entityKey, id } } },
      );
      if (error) {
        setError(formatClientError(error));
        return;
      }
      setPendingDelete(null);
      await loadRecords();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Xoá bản ghi thất bại");
    } finally {
      setSaving(false);
    }
  }, [config, entityKey, loadRecords, pendingDelete]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <div className="mb-3">
        <div>
          <h1 className="text-2xl font-semibold">Quản lý kho</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Quản lý kho lưu trữ, mặt hàng và tồn kho với thao tác thêm, sửa, xoá từng dòng.
          </p>
        </div>
      </div>

      <TableActionHeader
        className="mb-4"
        breadcrumbs={resolveBackofficeBreadcrumbs("/inventory-management")}
        items={buildInventoryToolbarItems({
          canCreate: Boolean(config),
          onCreate: () => {
            setEditingRecord(null);
            setFormOpen(true);
          },
        })}
      />

      <div className="mb-4 flex gap-3">
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={entityKey}
          onChange={(event) => setEntityKey(event.target.value)}
        >
          {ENTITY_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPagination((prev) => ({ ...prev, page: 1, search: searchInput }));
          }}
        >
          <Input
            className="flex-1"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm kiếm"
          />
          <Button type="submit" variant="outline">
            Tìm
          </Button>
        </form>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <BaseDataTable
        columns={columns}
        rows={records?.data ?? []}
        loading={loading}
        emptyLabel="Không có bản ghi."
        getRowKey={(row, index) =>
          String((config && row[config.idField]) ?? `row-${index}`)
        }
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
              Xoá
            </Button>
          </div>
        )}
      />

      <PaginationControls
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={records?.total ?? 0}
        onPageChange={(nextPage) =>
          setPagination((prev) => ({ ...prev, page: nextPage }))
        }
      />

      {formOpen && config && (
        <InventoryRecordFormModal
          config={config}
          saving={saving}
          record={editingRecord}
          onCancel={() => {
            setFormOpen(false);
            setEditingRecord(null);
          }}
          onSubmit={saveRecord}
        />
      )}

      {pendingDelete && config && (
        <ConfirmActionModal
          title={`Xoá ${config.displayName}`}
          message="Thao tác này không thể hoàn tác. Xác nhận xoá dòng này?"
          confirmLabel="Xoá"
          cancelLabel="Huỷ"
          loading={saving}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}

function buildInventoryToolbarItems({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}): ToolbarItem[] {
  return [
    { id: "create", label: "Thêm dòng", icon: Plus, onClick: onCreate, disabled: !canCreate },
    { id: "duplicate", label: "Nhân bản", icon: Copy, onClick: () => undefined, disabled: true },
    { id: "edit", label: "Sửa", icon: Pencil, onClick: () => undefined, disabled: true },
    { id: "delete", label: "Xoá", icon: Trash2, onClick: () => undefined, disabled: true, variant: "danger" },
  ];
}

function InventoryRecordFormModal({
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
  const readOnlyFields = config.fields.filter(
    (field) =>
      field.readOnly &&
      field.key !== config.idField &&
      field.key !== "createdAt" &&
      field.key !== "updatedAt",
  );

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
        {readOnlyFields.length > 0 && (
          <div className="mb-1 flex flex-col gap-2.5 border-b border-border pb-3">
            {readOnlyFields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-foreground">{field.label}</span>
                <span className="text-sm text-foreground">
                  {formatCell(record?.[field.key], field)}
                </span>
              </div>
            ))}
          </div>
        )}
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
        className="h-5 w-5 rounded border-2 border-input accent-primary cursor-pointer"
      />
    );
  }

  if (field.type === "number") {
    if (field.numberFormat === "money") {
      return (
        <MoneyInput
          value={
            value === undefined || value === null || value === ""
              ? ""
              : Number(value)
          }
          onChange={(v) => onChange(v === "" ? "" : v)}
        />
      );
    }
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
  if (value === null || value === undefined || value === "") return "-";
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
  if (field.type === "date") {
    try {
      return new Date(String(value)).toLocaleString("vi-VN");
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
