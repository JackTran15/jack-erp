import { useEffect, useMemo, useState } from "react";
import {
  AppModal,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  MoneyInput,
  Textarea,
} from "@erp/ui";
import { HelpButton } from "../HelpButton";
import { useCrudConfig, useCrudCreate, useCrudRecord, useCrudUpdate } from "./useCrudApi";
import { CrudFieldInput } from "./CrudFieldInput";
import { SupplierCreateForm } from "./inventory/SupplierCreateForm";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { TreeSelectInput } from "../forms/TreeSelectInput";
import { toast } from "sonner";
import type { FieldDefinition } from "@erp/shared-interfaces";

interface Props {
  entityKey: string;
  /** null → create; string id → edit */
  recordId: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: (record: Record<string, unknown>) => void;
}

function isBlank(v: unknown) {
  return v === undefined || v === null || v === "";
}

/** Entities that use the simple horizontal-layout Dialog (not the draggable AppModal). */
const SIMPLE_DIALOG_ENTITIES = new Set(["inventory-item-units", "provider-groups"]);

// ─── Horizontal form row (label left, control right) ─────────────────────────

function HRow({
  field,
  value,
  error,
  onChange,
  entityKey,
  currentRecordId,
}: {
  field: FieldDefinition;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
  entityKey?: string;
  currentRecordId?: string;
}) {
  const id = `hrow-${field.key}`;

  // Relation field → tree-select picker
  if (field.type === "relation" && field.relationEntity) {
    return (
      <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1.5">
        <label htmlFor={id} className="pt-2 text-sm font-medium leading-snug">
          {field.label}
          {field.required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
        <div>
          <TreeSelectInput
            inputId={id}
            value={typeof value === "string" ? value : ""}
            onChange={(id) => onChange(id || undefined)}
            entityKey={field.relationEntity}
            excludeId={currentRecordId}
            placeholder={`Tìm ${field.label.toLowerCase()}…`}
          />
          {error && <p className="mt-0.5 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  const control = () => {
    // Description / notes → textarea
    if (field.key === "description" || field.key === "notes") {
      return (
        <Textarea
          id={id}
          rows={4}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      );
    }
    if (field.type === "boolean") {
      return (
        <div className="flex items-center gap-2 pt-1">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border border-input accent-primary"
          />
          <label htmlFor={id} className="cursor-pointer text-sm">{field.label}</label>
        </div>
      );
    }
    if (field.type === "number" && field.numberFormat === "money") {
      return (
        <MoneyInput
          id={id}
          value={value === undefined || value === null || value === "" ? "" : Number(value)}
          onChange={(v) => onChange(v === "" ? undefined : v)}
        />
      );
    }
    if (field.type === "date") {
      return (
        <Input
          id={id}
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    return (
      <Input
        id={id}
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      />
    );
  };

  // For boolean, no separate label row needed
  if (field.type === "boolean") {
    return (
      <div className="flex items-start gap-2 py-1">
        <span className="w-32 shrink-0 pt-0.5 text-sm text-muted-foreground" />
        <div>{control()}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1.5">
      <label
        htmlFor={id}
        className="pt-2 text-sm font-medium leading-snug"
      >
        {field.label}
        {field.required && (
          <span className="ml-0.5 text-destructive">*</span>
        )}
      </label>
      <div>
        {control()}
        {error && (
          <p className="mt-0.5 text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main dialog component ────────────────────────────────────────────────────

export function CrudRecordDialog({
  entityKey,
  recordId,
  open,
  onClose,
  onSuccess,
}: Props) {
  const isEdit = recordId !== null;
  const isSupplier = entityKey === "inventory-providers";
  const isSimple = SIMPLE_DIALOG_ENTITIES.has(entityKey);

  const { data: config } = useCrudConfig(entityKey);
  const { data: record } = useCrudRecord(
    entityKey,
    recordId ?? undefined,
    isEdit && open && Boolean(config),
  );

  const createMutation = useCrudCreate(entityKey);
  const updateMutation = useCrudUpdate(entityKey);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const editableFields = useMemo(
    () =>
      config?.fields.filter(
        (f) =>
          !f.readOnly &&
          f.key !== config.idField &&
          f.key !== "createdAt" &&
          f.key !== "updatedAt",
      ) ?? [],
    [config],
  );

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!config) return;
    if (isEdit) {
      if (!record) return;
      const next: Record<string, unknown> = {};
      editableFields.forEach((f) => { next[f.key] = record[f.key]; });
      if (isSupplier) {
        for (const key of ["code", "type", "groupId", "groupName"] as const) {
          if (record[key] !== undefined) next[key] = record[key];
        }
      }
      setValues(next);
    } else {
      const defaults: Record<string, unknown> = {};
      editableFields.forEach((f) => { defaults[f.key] = f.type === "boolean" ? false : ""; });
      if (isSupplier) defaults.type = "organization";
      setValues(defaults);
    }
    setErrors({});
  }, [open, record, config, editableFields, isEdit, isSupplier]);

  const validate = () => {
    const next: Record<string, string> = {};
    editableFields.forEach((f) => {
      if (f.required && isBlank(values[f.key])) next[f.key] = `${f.label} là bắt buộc`;
    });
    if (isSupplier && isBlank(values.name)) next.name = "Tên nhà cung cấp là bắt buộc";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const DISPLAY_ONLY_KEYS = new Set(["groupName", "parentGroupName"]);

  const buildPayload = () => {
    if (isSupplier) {
      const payload = { ...values };
      DISPLAY_ONLY_KEYS.forEach((k) => delete payload[k]);
      if (isEdit) delete payload.code;
      return payload;
    }
    return Object.fromEntries(editableFields.map((f) => [f.key, values[f.key]]));
  };

  const save = async (andNew = false) => {
    if (!validate()) return;
    try {
      let saved: Record<string, unknown>;
      if (isEdit && recordId) {
        saved = await updateMutation.mutateAsync({ id: recordId, body: buildPayload() });
      } else {
        saved = await createMutation.mutateAsync(buildPayload());
      }
      onSuccess?.(saved);
      if (andNew) {
        const defaults: Record<string, unknown> = {};
        editableFields.forEach((f) => { defaults[f.key] = f.type === "boolean" ? false : ""; });
        if (isSupplier) defaults.type = "organization";
        setValues(defaults);
        setErrors({});
      } else {
        onClose();
      }
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  const title = isEdit
    ? `Sửa ${config?.displayName ?? ""}`
    : `Thêm mới ${config?.displayName ?? ""}`;

  // ── Simple centered Dialog (inventory-item-units, provider-groups) ──────────
  if (isSimple) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o && !isSaving) onClose(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="py-2">
            {editableFields.map((field) => (
              <HRow
                key={field.key}
                field={field}
                value={values[field.key]}
                error={errors[field.key]}
                entityKey={entityKey}
                currentRecordId={recordId ?? undefined}
                onChange={(v) => {
                  setValues((p) => ({ ...p, [field.key]: v }));
                  setErrors((p) => { const n = { ...p }; delete n[field.key]; return n; });
                }}
              />
            ))}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <HelpButton />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => void save(false)}
                disabled={isSaving}
              >
                {isSaving ? "Đang lưu…" : "Lưu"}
              </Button>
              {!isEdit && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void save(true)}
                  disabled={isSaving}
                >
                  + Lưu và thêm mới
                </Button>
              )}
              <Button
                variant="outline"
                type="button"
                onClick={onClose}
                disabled={isSaving}
              >
                × Hủy bỏ
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── AppModal for complex forms (inventory-providers) ────────────────────────
  const modalFooter = (
    <div className="flex w-full items-center justify-between gap-2">
      <HelpButton />
      <div className="flex gap-2">
        <Button type="button" onClick={() => void save(false)} disabled={isSaving}>
          {isSaving ? "Đang lưu…" : "Lưu"}
        </Button>
        {!isEdit && (
          <Button variant="outline" type="button" onClick={() => void save(true)} disabled={isSaving}>
            + Lưu và thêm mới
          </Button>
        )}
        <Button variant="outline" type="button" onClick={onClose} disabled={isSaving}>
          × Hủy bỏ
        </Button>
      </div>
    </div>
  );

  return (
    <AppModal
      open={open}
      onOpenChange={(o) => { if (!o && !isSaving) onClose(); }}
      title={title}
      footer={modalFooter}
      defaultWidth={isSupplier ? 720 : 560}
      defaultHeight={isSupplier ? 620 : 480}
      preventOutsideClose={isSaving}
      bodyClassName="overflow-auto"
    >
      <div className="p-4">
        {isSupplier ? (
          <SupplierCreateForm
            editableFields={editableFields}
            values={values}
            setValues={setValues}
            errors={errors}
            setErrors={setErrors}
            entityKey={entityKey}
            isSaving={isSaving}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {editableFields.map((field) => (
              <CrudFieldInput
                key={field.key}
                inputIdPrefix="dialog"
                field={field}
                value={values[field.key]}
                error={errors[field.key]}
                entityKey={entityKey}
                currentRecordId={recordId ?? undefined}
                onChange={(v) => {
                  setValues((p) => ({ ...p, [field.key]: v }));
                  setErrors((p) => { const n = { ...p }; delete n[field.key]; return n; });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </AppModal>
  );
}
