import { useEffect, useMemo, useState } from "react";
import {
  AppModal,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  MoneyInput,
  Textarea,
} from "@erp/ui";
import { HelpButton } from "../HelpButton";
import { apiClient } from "../../lib/api-axios";
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
  console.log("CrudRecordDialog", { entityKey, recordId, open });
  const isEdit = recordId !== null;
  const isSupplier = entityKey === "inventory-providers";
  const isStorage = entityKey === "inventory-storages";
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
  // Storage: the default-receiving flag is toggled through a dedicated endpoint
  // (one-per-branch invariant), not the generic PATCH — track it separately.
  const [storageDefaultReceiving, setStorageDefaultReceiving] = useState(false);
  // Ngừng hoạt động (isActive=false) — không cho tắt kho showroom / kho nhập mặc định.
  const [storageInactive, setStorageInactive] = useState(false);
  const wasStorageDefault = isStorage && Boolean(record?.isDefaultReceiving);
  const cannotDeactivate =
    isStorage && (Boolean(record?.isMainStorage) || wasStorageDefault);

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
      if (isStorage) {
        setStorageDefaultReceiving(Boolean(record.isDefaultReceiving));
        setStorageInactive(record.isActive === false);
      }
    } else {
      const defaults: Record<string, unknown> = {};
      editableFields.forEach((f) => { defaults[f.key] = f.type === "boolean" ? false : ""; });
      if (isSupplier) defaults.type = "organization";
      setValues(defaults);
      if (isStorage) {
        setStorageDefaultReceiving(false);
        setStorageInactive(false);
      }
    }
    setErrors({});
  }, [open, record, config, editableFields, isEdit, isSupplier, isStorage]);

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
    const payload = Object.fromEntries(
      editableFields.map((f) => [f.key, values[f.key]]),
    );
    // Ngừng hoạt động kho đi qua generic PATCH (isDefaultReceiving vẫn bị strip ở backend).
    if (isStorage) payload.isActive = !storageInactive;
    return payload;
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
      // Storage: apply the default-receiving flag via the dedicated endpoint.
      // Only a false→true transition needs a call (it clears the previous default
      // in the same branch transactionally). Already-default storages are no-ops.
      if (isStorage && storageDefaultReceiving && !wasStorageDefault) {
        const targetId = isEdit && recordId ? recordId : String(saved.id ?? "");
        if (targetId) {
          await apiClient.post(
            `/v2/inventory/storages/${targetId}/set-default-receiving`,
          );
        }
      }
      toast.success(
        isEdit
          ? `Đã cập nhật ${config?.displayName ?? "bản ghi"}.`
          : `Đã tạo ${config?.displayName ?? "bản ghi"}.`,
      );
      onSuccess?.(saved);
      if (andNew) {
        const defaults: Record<string, unknown> = {};
        editableFields.forEach((f) => { defaults[f.key] = f.type === "boolean" ? false : ""; });
        if (isSupplier) defaults.type = "organization";
        setValues(defaults);
        if (isStorage) {
          setStorageDefaultReceiving(false);
          setStorageInactive(false);
        }
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
                className="!bg-primary-blue !text-white hover:!bg-primary-blue-hover"
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
                Hủy bỏ
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
        <Button
          type="button"
          className="!bg-primary-blue !text-white hover:!bg-primary-blue-hover"
          onClick={() => void save(false)}
          disabled={isSaving}
        >
          {isSaving ? "Đang lưu…" : "Lưu"}
        </Button>
        {!isEdit && (
          <Button variant="outline" type="button" onClick={() => void save(true)} disabled={isSaving}>
            + Lưu và thêm mới
          </Button>
        )}
        <Button variant="outline" type="button" onClick={onClose} disabled={isSaving}>
          Hủy bỏ
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
      defaultHeight={isSupplier ? 620 : isStorage ? (isEdit ? 470 : 400) : 480}
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
          <>
            {isStorage ? (
              <div className="space-y-4">
                {/* Mã kho — hệ thống cấp, chỉ đọc */}
                <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                  <label
                    htmlFor="dialog-storage-code"
                    className="text-sm font-medium text-muted-foreground"
                  >
                    Mã kho
                  </label>
                  <Input
                    id="dialog-storage-code"
                    type="text"
                    value={isEdit ? String(record?.code ?? "") : ""}
                    disabled
                  />
                </div>
                {/* Tên kho */}
                <div className="grid grid-cols-[140px_1fr] items-start gap-3">
                  <label
                    htmlFor="dialog-storage-name"
                    className="pt-2 text-sm font-medium"
                  >
                    Tên kho <span className="text-destructive">*</span>
                  </label>
                  <div>
                    <Input
                      id="dialog-storage-name"
                      type="text"
                      value={String(values.name ?? "")}
                      aria-invalid={Boolean(errors.name)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setValues((p) => ({ ...p, name: v }));
                        setErrors((p) => { const n = { ...p }; delete n.name; return n; });
                      }}
                    />
                    {errors.name && (
                      <p className="mt-1 text-xs text-destructive">{errors.name}</p>
                    )}
                  </div>
                </div>
                {/* Diễn giải */}
                <div className="grid grid-cols-[140px_1fr] items-start gap-3">
                  <label
                    htmlFor="dialog-storage-desc"
                    className="pt-2 text-sm font-medium text-muted-foreground"
                  >
                    Diễn giải
                  </label>
                  <Textarea
                    id="dialog-storage-desc"
                    rows={3}
                    value={String(values.description ?? "")}
                    onChange={(e) =>
                      setValues((p) => ({ ...p, description: e.target.value }))
                    }
                  />
                </div>
                {/* Loại kho — chỉ hiển thị khi sửa */}
                {isEdit && (
                  <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">
                      Loại kho
                    </span>
                    <span className="text-sm">
                      {record?.isMainStorage ? "Bán hàng" : "Kho lưu trữ"}
                    </span>
                  </div>
                )}
                {/* Cờ trạng thái */}
                <div className="space-y-3 border-t border-border pt-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-input accent-primary disabled:cursor-not-allowed disabled:opacity-70"
                      checked={storageDefaultReceiving}
                      disabled={wasStorageDefault}
                      onChange={(e) => setStorageDefaultReceiving(e.target.checked)}
                    />
                    <span className="cursor-pointer select-none font-medium">
                      Kho nhập hàng mặc định
                    </span>
                  </label>
                  {wasStorageDefault && (
                    <p className="text-xs text-muted-foreground">
                      Đây đang là kho nhập hàng mặc định của chi nhánh. Để đổi, hãy
                      mở một kho khác và tích chọn ô này.
                    </p>
                  )}
                  {/* Ngừng hoạt động: chỉ khi SỬA và kho được phép (giống MISA) */}
                  {isEdit && !cannotDeactivate && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-input accent-primary"
                        checked={storageInactive}
                        onChange={(e) => setStorageInactive(e.target.checked)}
                      />
                      <span className="cursor-pointer select-none font-medium">
                        Ngừng hoạt động
                      </span>
                    </label>
                  )}
                </div>
              </div>
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
          </>
        )}
      </div>
    </AppModal>
  );
}
