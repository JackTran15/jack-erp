import { useMemo, useRef, useState, type ReactNode } from "react";
import type { CrudEntityConfig, FieldDefinition } from "@erp/shared-interfaces";
import { AppModal, Button, Input, MoneyInput, Textarea } from "@erp/ui";
import { HelpCircle, Save, X } from "lucide-react";
import { apiClient } from "../../lib/api-axios";
import { formatCrudEnumOption } from "../../lib/crud-display";
import { SearchListingInput } from "../forms/SearchListingInput";

type SearchSelection = {
  id: string;
  label: string;
};

type SearchFieldConfig<T> = {
  placeholder: string;
  search: (query: string) => Promise<T[]>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;
  getLabel: (item: T) => string;
};

type InventoryProvider = {
  id: string;
  name: string;
  code: string;
};

type InventoryStorage = {
  id: string;
  name: string;
  branchId: string;
};

type InventoryLocation = {
  id: string;
  name: string;
  code: string;
  storageId: string;
};

type InventoryItem = {
  id: string;
  name: string;
  code: string;
  unit: string;
};

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

const searchProviders = async (query: string) => {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "8",
    search: query.trim(),
  });
  const { data } = await apiClient.get<PaginatedResponse<InventoryProvider>>(
    `/inventory/providers?${params}`,
  );
  return data.data;
};

const searchStorages = async (query: string) => {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "8",
    search: query.trim(),
  });
  const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
    `/inventory/storages?${params}`,
  );
  return data.data;
};

const searchLocations = async (query: string) => {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "8",
    search: query.trim(),
  });
  const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
    `/inventory/locations?${params}`,
  );
  return data.data;
};

const searchItems = async (query: string) => {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "8",
    search: query.trim(),
  });
  const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>(
    `/inventory/items?${params}`,
  );
  return data.data;
};

const SEARCH_FIELD_CONFIG: Record<string, Record<string, SearchFieldConfig<any>>> = {
  "inventory-items": {
    providerId: {
      placeholder: "Tìm theo mã hoặc tên nhà cung cấp",
      search: searchProviders,
      itemKey: (provider: InventoryProvider) => provider.id,
      renderItem: (provider: InventoryProvider) => provider.name,
      renderMeta: (provider: InventoryProvider) => provider.code,
      getLabel: (provider: InventoryProvider) => `${provider.code} · ${provider.name}`,
    },
  },
  "inventory-locations": {
    storageId: {
      placeholder: "Tìm theo tên kho hoặc ID chi nhánh",
      search: searchStorages,
      itemKey: (storage: InventoryStorage) => storage.id,
      renderItem: (storage: InventoryStorage) => storage.name,
      renderMeta: (storage: InventoryStorage) => storage.branchId,
      getLabel: (storage: InventoryStorage) => `${storage.name} · ${storage.branchId}`,
    },
  },
  "inventory-stock-balances": {
    itemId: {
      placeholder: "Tìm theo mã hoặc tên mặt hàng",
      search: searchItems,
      itemKey: (item: InventoryItem) => item.id,
      renderItem: (item: InventoryItem) => item.name,
      renderMeta: (item: InventoryItem) => `${item.code} · ${item.unit}`,
      getLabel: (item: InventoryItem) => `${item.code} · ${item.name}`,
    },
    locationId: {
      placeholder: "Tìm theo mã hoặc tên vị trí",
      search: searchLocations,
      itemKey: (location: InventoryLocation) => location.id,
      renderItem: (location: InventoryLocation) => location.name,
      renderMeta: (location: InventoryLocation) =>
        `${location.code} · ${location.storageId}`,
      getLabel: (location: InventoryLocation) =>
        `${location.code} · ${location.name}`,
    },
  },
};

const getSearchFieldConfig = (entityKey: string, fieldKey: string) =>
  SEARCH_FIELD_CONFIG[entityKey]?.[fieldKey] ?? null;

const getSearchSelectionId = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return String((value as SearchSelection).id || "");
  }
  return "";
};

const getInitialSearchSelection = (
  entityKey: string,
  fieldKey: string,
  record: Record<string, unknown>,
): SearchSelection => {
  if (entityKey === "inventory-stock-balances" && fieldKey === "itemId") {
    const code = String(record.itemCode ?? "").trim();
    const name = String(record.itemName ?? "").trim();
    const label = [code, name].filter(Boolean).join(" · ");
    return {
      id: String(record.itemId ?? ""),
      label: label || String(record.itemId ?? ""),
    };
  }
  if (entityKey === "inventory-stock-balances" && fieldKey === "locationId") {
    return {
      id: String(record.locationId ?? ""),
      label: String(record.locationId ?? ""),
    };
  }
  return {
    id: String(record[fieldKey] ?? ""),
    label: String(record[fieldKey] ?? ""),
  };
};

interface CrudFormDialogProps {
  config: CrudEntityConfig;
  record: Record<string, unknown> | null;
  duplicateSource?: Record<string, unknown> | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

function fieldsForFormState(
  config: CrudEntityConfig,
  record: Record<string, unknown> | null,
  duplicateSource: Record<string, unknown> | null | undefined,
): FieldDefinition[] {
  const notIdOrAudit = (f: FieldDefinition) =>
    f.key !== config.idField && f.key !== "createdAt" && f.key !== "updatedAt";
  if (duplicateSource && !record) {
    return config.fields.filter((f) => notIdOrAudit(f) && !f.readOnly);
  }
  return config.fields.filter(notIdOrAudit);
}

function buildInitialValues(
  fields: FieldDefinition[],
  record: Record<string, unknown> | null,
  duplicateSource: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (record) return { ...record };
  if (duplicateSource) {
    const initial: Record<string, unknown> = {};
    fields.forEach((f) => {
      const v = duplicateSource[f.key];
      if (v === undefined || v === null) {
        initial[f.key] = f.type === "boolean" ? false : "";
      } else {
        initial[f.key] = v;
      }
    });
    return initial;
  }
  const initial: Record<string, unknown> = {};
  fields.forEach((f) => {
    initial[f.key] = f.type === "boolean" ? false : "";
  });
  return initial;
}

export function CrudFormDialog({
  config,
  record,
  duplicateSource = null,
  onSubmit,
  onClose,
}: CrudFormDialogProps) {
  const isEdit = record !== null;
  const isDuplicate = Boolean(duplicateSource) && !isEdit;

  const editableFields = useMemo(
    () => fieldsForFormState(config, record, duplicateSource),
    [config, record, duplicateSource],
  );

  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const base = buildInitialValues(editableFields, record, duplicateSource);
    editableFields.forEach((f) => {
      if (
        config.entityKey === "inventory-item-categories" &&
        f.key === "status" &&
        !base[f.key]
      ) {
        base[f.key] = "ACTIVE";
      }
      const searchConfig = getSearchFieldConfig(config.entityKey, f.key);
      if (!searchConfig) return;
      if (record) {
        base[f.key] = getInitialSearchSelection(config.entityKey, f.key, record);
      } else {
        base[f.key] = { id: "", label: "" };
      }
    });
    return base;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    editableFields.forEach((f) => {
      const searchConfig = getSearchFieldConfig(config.entityKey, f.key);
      const isMissing = searchConfig
        ? !getSearchSelectionId(values[f.key])
        : values[f.key] === "" || values[f.key] === undefined || values[f.key] === null;
      if (f.required && isMissing) {
        next[f.key] = `${f.label} là bắt buộc`;
      }
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      editableFields.forEach((f) => {
        const searchConfig = getSearchFieldConfig(config.entityKey, f.key);
        if (searchConfig) {
          payload[f.key] = getSearchSelectionId(values[f.key]);
        } else {
          payload[f.key] = values[f.key];
        }
      });
      // Không gửi id / audit khi tạo hoặc nhân bản
      delete payload[config.idField];
      delete payload.createdAt;
      delete payload.updatedAt;
      await onSubmit(payload);
    } catch {
      return;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = () => {
    formRef.current?.requestSubmit();
  };

  const title = isDuplicate
    ? `Nhân bản ${config.displayName}`
    : `${isEdit ? "Sửa" : "Thêm mới"} ${config.displayName}`;

  const saveLabel = submitting
    ? "Đang lưu…"
    : isEdit
      ? "Lưu"
      : "Lưu";

  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={
        isDuplicate
          ? "Dữ liệu đã được sao chép từ bản ghi đã chọn. Hãy chỉnh các trường bắt buộc (ví dụ mã, SKU) nếu trùng trước khi lưu."
          : undefined
      }
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
            <Button type="button" disabled={submitting} onClick={handleSave}>
              <Save className="mr-1.5 h-4 w-4" />
              {saveLabel}
            </Button>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              <X className="mr-1.5 h-4 w-4" />
              Hủy bỏ
            </Button>
          </div>
        </div>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 py-2">
        {editableFields.map((f) => (
          <FieldInput
            key={f.key}
            entityKey={config.entityKey}
            field={f}
            value={values[f.key]}
            error={errors[f.key]}
            onChange={(v) => handleChange(f.key, v)}
          />
        ))}
      </form>
    </AppModal>
  );
}

function FieldInput({
  entityKey,
  field,
  value,
  error,
  onChange,
}: {
  entityKey: string;
  field: FieldDefinition;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  const id = `field-${field.key}`;
  const searchConfig = getSearchFieldConfig(entityKey, field.key);

  if (field.type === "boolean") {
    return (
      <FieldRow label={field.label} required={field.required} error={error}>
        <div className="flex items-start gap-3">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-input accent-primary"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <label htmlFor={id} className="cursor-pointer select-none text-sm leading-snug">
            Có
          </label>
        </div>
      </FieldRow>
    );
  }

  if (field.type === "enum" && field.enumValues) {
    return (
      <FieldRow label={field.label} required={field.required} error={error}>
        <select
          id={id}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Chọn —</option>
          {field.enumValues.map((ev) => (
            <option key={ev} value={ev}>
              {formatCrudEnumOption(field, ev)}
            </option>
          ))}
        </select>
      </FieldRow>
    );
  }

  if (searchConfig) {
    const selection = value as SearchSelection;
    const label = selection?.label ?? "";
    return (
      <FieldRow label={field.label} required={field.required} error={error}>
        <SearchListingInput
          inputId={id}
          value={label}
          onValueChange={(val) => onChange({ id: "", label: val })}
          onSelect={(item) =>
            onChange({
              id: searchConfig.itemKey(item),
              label: searchConfig.getLabel(item),
            })
          }
          search={searchConfig.search}
          itemKey={searchConfig.itemKey}
          renderItem={searchConfig.renderItem}
          renderMeta={searchConfig.renderMeta}
          placeholder={searchConfig.placeholder}
          required={field.required}
        />
      </FieldRow>
    );
  }

  if (field.type === "number") {
    if (field.numberFormat === "money") {
      return (
        <FieldRow label={field.label} required={field.required} error={error}>
          <MoneyInput
            id={id}
            value={
              value === undefined || value === null || value === ""
                ? ""
                : Number(value)
            }
            onChange={(v) => onChange(v === "" ? "" : v)}
          />
        </FieldRow>
      );
    }
    return (
      <FieldRow label={field.label} required={field.required} error={error}>
        <Input
          id={id}
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
      </FieldRow>
    );
  }

  if (field.type === "date") {
    return (
      <FieldRow label={field.label} required={field.required} error={error}>
        <Input
          id={id}
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </FieldRow>
    );
  }

  if (field.key === "description") {
    return (
      <FieldRow label={field.label} required={field.required} error={error}>
        <Textarea
          id={id}
          className="min-h-[104px] resize-y leading-relaxed"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      </FieldRow>
    );
  }

  return (
    <FieldRow label={field.label} required={field.required} error={error}>
      <Input
        id={id}
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldRow>
  );
}

function FieldRow({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3">
      <label className="pt-1.5 text-sm">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </label>
      <div className="min-w-0">
        {children}
        {error ? (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
