import { useState, useRef } from "react";
import type { CrudEntityConfig, FieldDefinition } from "@erp/shared-interfaces";
import { AppModal, FormField, Input } from "@erp/ui";
import { formatCustomerStatus } from "../../lib/customer-display";

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
    if (record) return { ...record };
    const initial: Record<string, unknown> = {};
    editableFields.forEach((f) => {
      initial[f.key] = f.type === "boolean" ? false : "";
    });
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    editableFields.forEach((f) => {
      if (f.required && (values[f.key] === "" || values[f.key] === undefined || values[f.key] === null)) {
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
