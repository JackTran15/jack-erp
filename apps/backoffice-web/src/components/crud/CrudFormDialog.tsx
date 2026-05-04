import { useMemo, useRef, useState } from "react";
import type { CrudEntityConfig, FieldDefinition } from "@erp/shared-interfaces";
import { AppModal, FormField, Input } from "@erp/ui";
import { formatCustomerStatus } from "../../lib/customer-display";

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

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildInitialValues(
      fieldsForFormState(config, record, duplicateSource),
      record,
      duplicateSource,
    ),
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    editableFields.forEach((f) => {
      if (
        f.required &&
        (values[f.key] === "" || values[f.key] === undefined || values[f.key] === null)
      ) {
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
        payload[f.key] = values[f.key];
      });
      // Không gửi id / audit khi tạo hoặc nhân bản
      delete payload[config.idField];
      delete payload.createdAt;
      delete payload.updatedAt;
      await onSubmit(payload);
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
      ? "Cập nhật"
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
      onSave={handleSave}
      onCancel={onClose}
      saveLabel={saveLabel}
      cancelLabel="Huỷ"
      saveDisabled={submitting}
    >
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {editableFields.map((f) => (
          <FieldInput
            key={f.key}
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
  field,
  value,
  error,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  const id = `field-${field.key}`;

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

  if (field.type === "number") {
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
