import { useState, useRef, type ReactNode } from "react";
import type { CrudEntityConfig, FieldDefinition } from "@erp/shared-interfaces";
import { AppModal, FormField, Input, MoneyInput } from "@erp/ui";
import { formatCustomerStatus } from "../../lib/customer-display";
import { apiClient } from "../../lib/api-axios";
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
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

export function CrudFormDialog({
  config,
  record,
  onSubmit,
  onClose,
}: CrudFormDialogProps) {
  const isEdit = record !== null;
  const editableFields = config.fields.filter(
    (f) => f.key !== config.idField && f.key !== "createdAt" && f.key !== "updatedAt",
  );

  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (record) {
      const initial: Record<string, unknown> = { ...record };
      editableFields.forEach((f) => {
        const searchConfig = getSearchFieldConfig(config.entityKey, f.key);
        if (searchConfig) {
          initial[f.key] = getInitialSearchSelection(config.entityKey, f.key, record);
        }
      });
      return initial;
    }
    const initial: Record<string, unknown> = {};
    editableFields.forEach((f) => {
      if (getSearchFieldConfig(config.entityKey, f.key)) {
        initial[f.key] = { id: "", label: "" };
      } else {
        initial[f.key] = f.type === "boolean" ? false : "";
      }
    });
    return initial;
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
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = () => {
    formRef.current?.requestSubmit();
  };

  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${isEdit ? "Sửa" : "Thêm"} ${config.displayName}`}
      onSave={handleSave}
      onCancel={onClose}
      saveLabel={submitting ? "Đang lưu…" : isEdit ? "Cập nhật" : "Tạo"}
      cancelLabel="Huỷ"
      saveDisabled={submitting}
    >
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
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
      <FormField label={field.label} htmlFor={id} error={error} required={field.required}>
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded border-2 border-input accent-primary cursor-pointer"
        />
      </FormField>
    );
  }

  if (field.type === "enum" && field.enumValues) {
    return (
      <FormField label={field.label} htmlFor={id} error={error} required={field.required}>
        <select
          id={id}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— Chọn —</option>
          {field.enumValues.map((ev) => (
            <option key={ev} value={ev}>
              {field.key === "status" ? formatCustomerStatus(ev) : ev}
            </option>
          ))}
        </select>
      </FormField>
    );
  }

  if (searchConfig) {
    const selection = value as SearchSelection;
    const label = selection?.label ?? "";
    return (
      <FormField label={field.label} htmlFor={id} error={error} required={field.required}>
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
      </FormField>
    );
  }

  if (field.type === "number") {
    if (field.numberFormat === "money") {
      return (
        <FormField label={field.label} htmlFor={id} error={error} required={field.required}>
          <MoneyInput
            id={id}
            value={
              value === undefined || value === null || value === ""
                ? ""
                : Number(value)
            }
            onChange={(v) => onChange(v === "" ? "" : v)}
          />
        </FormField>
      );
    }
    return (
      <FormField label={field.label} htmlFor={id} error={error} required={field.required}>
        <Input
          id={id}
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
      </FormField>
    );
  }

  if (field.type === "date") {
    return (
      <FormField label={field.label} htmlFor={id} error={error} required={field.required}>
        <Input
          id={id}
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </FormField>
    );
  }

  return (
    <FormField label={field.label} htmlFor={id} error={error} required={field.required}>
      <Input
        id={id}
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </FormField>
  );
}
