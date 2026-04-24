import { useState } from "react";
import type { CrudEntityConfig, FieldDefinition } from "@erp/shared-interfaces";

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
        next[f.key] = `${f.label} is required`;
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

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.dialogTitle}>
          {isEdit ? "Edit" : "Create"} {config.displayName}
        </h2>

        <form onSubmit={handleSubmit} style={styles.form}>
          {editableFields.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={values[f.key]}
              error={errors[f.key]}
              onChange={(v) => handleChange(f.key, v)}
            />
          ))}

          <div style={styles.actions}>
            <button type="button" style={styles.btnCancel} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" style={styles.btnSubmit} disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
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

  return (
    <div style={styles.fieldGroup}>
      <label htmlFor={id} style={styles.label}>
        {field.label}
        {field.required && <span style={{ color: "#d32f2f" }}> *</span>}
      </label>

      {field.type === "boolean" ? (
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : field.type === "enum" && field.enumValues ? (
        <select
          id={id}
          style={styles.input}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— select —</option>
          {field.enumValues.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
      ) : field.type === "number" ? (
        <input
          id={id}
          style={styles.input}
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
        />
      ) : field.type === "date" ? (
        <input
          id={id}
          style={styles.input}
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          style={styles.input}
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {error && <span style={styles.error}>{error}</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    paddingTop: 80,
    zIndex: 1000,
  },
  dialog: {
    background: "#fff",
    borderRadius: 12,
    padding: "24px 28px",
    width: "100%",
    maxWidth: 560,
    maxHeight: "80vh",
    overflowY: "auto",
    boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
  },
  dialogTitle: { margin: "0 0 20px", fontSize: 20, fontWeight: 600 },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 13, fontWeight: 500, color: "#344054" },
  input: {
    padding: "8px 12px",
    fontSize: 14,
    border: "1px solid #d0d5dd",
    borderRadius: 6,
    outline: "none",
  },
  error: { fontSize: 12, color: "#d32f2f" },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  btnCancel: {
    padding: "8px 16px",
    background: "#fff",
    color: "#344054",
    border: "1px solid #d0d5dd",
    borderRadius: 6,
    fontSize: 14,
    cursor: "pointer",
  },
  btnSubmit: {
    padding: "8px 16px",
    background: "#1570ef",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
};
