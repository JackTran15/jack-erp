import { type FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@erp/ui";
import { Plus } from "lucide-react";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { useCrudConfig, useCrudCreate, useCrudRecord } from "./useCrudApi";
import { buildCrudPayload, sanitizeCrudPayload } from "./crudPayload";
import { CrudFieldInput } from "./CrudFieldInput";
import { InventoryItemCreateForm } from "./inventory/InventoryItemCreateForm";
import type { InventoryItemSaveMode } from "./inventory/item-create/InventoryItemActionBar";
import { SupplierCreateForm } from "./inventory/SupplierCreateForm";
import { AdminPageShell } from "../layout/AdminPageShell";
import { PageHeader } from "../layout/PageHeader";
import { resolveBackofficeBreadcrumbs } from "../layout/breadcrumbs";
import { isNotFoundHttpError } from "../../lib/not-found-http-error";
import { HttpErrorView } from "../../pages/errors/HttpErrorPage";

/** Fields stripped when cloning an inventory item (must be unique per item). */
const CLONE_STRIP_FIELDS = new Set(["code", "sku", "barcode", "id", "createdAt", "updatedAt"]);

function stripCloneFields(source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) {
    if (!CLONE_STRIP_FIELDS.has(k)) result[k] = v;
  }
  return result;
}

export function CrudCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { entityKey } = useParams<{ entityKey: string }>();

  // cloneFromId is set when navigating from list "Nhân bản" or edit page "Lưu và nhân bản".
  const cloneFromId = (location.state as Record<string, unknown> | null)?.cloneFromId as string | undefined;

  const { data: config, isLoading, error } = useCrudConfig(entityKey!);
  const createMutation = useCrudCreate(entityKey!);
  // Fetch the full record when cloning from an existing item (list or edit page).
  const cloneSourceQuery = useCrudRecord(entityKey!, cloneFromId, Boolean(cloneFromId && entityKey));

  const editableFields = useMemo(
    () =>
      config?.fields.filter(
        (field) =>
          !field.readOnly &&
          field.key !== config.idField &&
          field.key !== "createdAt" &&
          field.key !== "updatedAt",
      ) ?? [],
    [config],
  );

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // formKey forces InventoryItemCreateForm to remount after save-and-new / save-and-clone.
  const [formKey, setFormKey] = useState(0);
  // suppressSkuAutoFill=true after clone so the form doesn't auto-generate the old SKU from name.
  const [suppressSkuAutoFill, setSuppressSkuAutoFill] = useState(Boolean(cloneFromId));
  // initialRecord for clone mode — passed to form so it seeds unitRows/providerRows/extras.
  const [cloneInitialRecord, setCloneInitialRecord] = useState<Record<string, unknown> | undefined>(undefined);

  const saveModeRef = useRef<InventoryItemSaveMode>("save");
  const cloneAppliedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const buildDefaults = useCallback(() => {
    const defaults: Record<string, unknown> = {};
    editableFields.forEach((field) => {
      defaults[field.key] = field.type === "boolean" ? false : "";
    });
    // Default isActive to true for entities where "active" is the expected initial state.
    if (entityKey === "inventory-items" || entityKey === "inventory-providers") {
      defaults.isActive = true;
    }
    return defaults;
  }, [editableFields, entityKey]);

  // Set form defaults when config loads — skip if we're about to seed from a clone source.
  useEffect(() => {
    if (!config) return;
    if (cloneFromId) return; // Clone data will be applied by the next effect once fetched.
    setValues(buildDefaults());
  }, [config, buildDefaults, cloneFromId]);

  // Seed values + initialRecord from the fetched clone source (list / edit-page clone).
  // cloneAppliedRef prevents re-seeding if deps fire more than once.
  useEffect(() => {
    const source = cloneSourceQuery.data;
    if (!source || cloneAppliedRef.current) return;
    cloneAppliedRef.current = true;
    const stripped = stripCloneFields(source);
    setValues(stripped);
    setCloneInitialRecord(source);
    setSuppressSkuAutoFill(true);
  }, [cloneSourceQuery.data]);

  // Sets save mode then programmatically submits the form — mode is guaranteed set before handleSubmit.
  const handleSaveMode = useCallback((mode: InventoryItemSaveMode) => {
    saveModeRef.current = mode;
    formRef.current?.requestSubmit();
  }, []);

  if (isLoading || (cloneFromId && cloneSourceQuery.isLoading)) {
    return (
      <AdminPageShell>
        <p>Đang tải…</p>
      </AdminPageShell>
    );
  }
  if (error) {
    if (isNotFoundHttpError(error)) {
      return (
        <AdminPageShell>
          <HttpErrorView code={404} />
        </AdminPageShell>
      );
    }
    return (
      <AdminPageShell>
        <p className="text-destructive">
          Lỗi tải cấu hình: {error instanceof Error ? error.message : "Không xác định"}
        </p>
      </AdminPageShell>
    );
  }
  if (!config) {
    return (
      <AdminPageShell>
        <p>Không tìm thấy cấu hình thực thể.</p>
      </AdminPageShell>
    );
  }

  const breadcrumbs = resolveBackofficeBreadcrumbs(location.pathname, [
    { label: `Thêm mới ${config.displayName}` },
  ]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    editableFields.forEach((field) => {
      if (field.required && isBlank(values[field.key])) {
        nextErrors[field.key] = `${field.label} là bắt buộc`;
      }
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    // For inventory-items and inventory-providers the custom form manages extra keys
    // not in editableFields (nested data, type-conditional fields). Send the whole
    // values map for those; the generic CRUD backend accepts Record<string,any>.
    let payload: Record<string, unknown>;
    if (entityKey === "inventory-items" || entityKey === "inventory-providers") {
      payload = sanitizeCrudPayload(editableFields, values, "create");
    } else {
      payload = buildCrudPayload(editableFields, values, "create");
    }

    try {
      await createMutation.mutateAsync(payload);
      toast.success(`Đã tạo ${config.displayName}.`);

      const mode = saveModeRef.current;
      saveModeRef.current = "save";

      if (mode === "save-and-new") {
        setValues(buildDefaults());
        setErrors({});
        setSuppressSkuAutoFill(false);
        setCloneInitialRecord(undefined);
        setFormKey((k) => k + 1);
      } else if (mode === "save-and-clone") {
        // Use submitted payload as clone source (has all nested data: units, providers etc.)
        const stripped = stripCloneFields(payload);
        setValues(stripped);
        setCloneInitialRecord(payload); // full payload so form can hydrate nested rows
        setErrors({});
        setSuppressSkuAutoFill(true);
        setFormKey((k) => k + 1);
      } else {
        navigate(`/admin/${entityKey}`, { replace: true });
      }
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <AdminPageShell>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={`Thêm mới ${config.displayName}`}
          breadcrumbs={breadcrumbs}
        />
        {entityKey !== "inventory-items" && (
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/admin/${entityKey}`)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => {
                saveModeRef.current = "save-and-new";
                formRef.current?.requestSubmit();
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Lưu và thêm mới
            </Button>
            <Button type="submit" form="crud-create-form" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
        <form id="crud-create-form" ref={formRef} onSubmit={handleSubmit}>
          {entityKey === "inventory-items" ? (
            <InventoryItemCreateForm
              key={formKey}
              editableFields={editableFields}
              values={values}
              setValues={setValues}
              errors={errors}
              setErrors={setErrors}
              entityKey={entityKey!}
              isSaving={createMutation.isPending}
              onSaveMode={handleSaveMode}
              suppressSkuAutoFill={suppressSkuAutoFill}
              initialRecord={cloneInitialRecord}
            />
          ) : entityKey === "inventory-providers" ? (
            <SupplierCreateForm
              editableFields={editableFields}
              values={values}
              setValues={setValues}
              errors={errors}
              setErrors={setErrors}
              entityKey={entityKey!}
              isSaving={createMutation.isPending}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {editableFields.map((field) => (
                <div key={field.key} className={field.key === "description" ? "md:col-span-2" : undefined}>
                  <CrudFieldInput
                    inputIdPrefix="create"
                    field={field}
                    value={values[field.key]}
                    error={errors[field.key]}
                    entityKey={entityKey}
                    onChange={(nextValue) => {
                      setValues((prev) => ({ ...prev, [field.key]: nextValue }));
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next[field.key];
                        return next;
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
    </AdminPageShell>
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
