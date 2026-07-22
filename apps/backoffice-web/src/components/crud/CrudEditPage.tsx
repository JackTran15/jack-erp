import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@erp/ui";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { useCrudConfig, useCrudRecord, useCrudUpdate } from "./useCrudApi";
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
import {
  navigateToCrudList,
  parseCrudListLocationState,
} from "./crudListNavigation";

export function CrudEditPage() {
  const { entityKey, id } = useParams<{ entityKey: string; id: string }>();
  const isUnit = entityKey === "inventory-item-units";
  const navigate = useNavigate();
  const location = useLocation();
  const listReturnRef = useRef(
    parseCrudListLocationState(location.state)?.crudListReturn,
  );

  const navigateBackToList = () => {
    if (listReturnRef.current) {
      navigateToCrudList(navigate, entityKey!, listReturnRef.current);
      return;
    }
    navigate(`/admin/${entityKey}`, { replace: true });
  };

  const { data: config, isLoading: configLoading, error: configError } = useCrudConfig(entityKey!);
  const {
    data: record,
    isLoading: recordLoading,
    error: recordError,
  } = useCrudRecord(entityKey!, id, Boolean(config && id));
  const updateMutation = useCrudUpdate(entityKey!);

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

  const saveModeRef = useRef<InventoryItemSaveMode>("save");
  const formRef = useRef<HTMLFormElement>(null);

  const handleSaveMode = useCallback((mode: InventoryItemSaveMode) => {
    saveModeRef.current = mode;
    formRef.current?.requestSubmit();
  }, []);

  useEffect(() => {
    if (!record) return;
    // The inventory-item form manages many keys outside editableFields (nested
    // providers/units, denormalized brand/category, package specs) — hydrate from
    // the full record.
    if (entityKey === "inventory-items") {
      setValues({ ...record });
      setErrors({});
      return;
    }
    const next: Record<string, unknown> = {};
    editableFields.forEach((field) => {
      next[field.key] = record[field.key];
    });
    // For the supplier custom form, also pull in fields that aren't in editableFields
    // (readOnly/hideInList) so the form can display the current code and groupName.
    if (entityKey === "inventory-providers") {
      const extras = ["code", "type", "groupId", "groupName"] as const;
      for (const key of extras) {
        if (record[key] !== undefined) next[key] = record[key];
      }
    }
    setValues(next);
    setErrors({});
  }, [record, editableFields, entityKey]);

  if (configLoading || recordLoading) {
    return (
      <AdminPageShell>
        <p>Đang tải…</p>
      </AdminPageShell>
    );
  }
  if (configError) {
    if (isNotFoundHttpError(configError)) {
      return (
        <AdminPageShell>
          <HttpErrorView code={404} />
        </AdminPageShell>
      );
    }
    return (
      <AdminPageShell>
        <p className="text-destructive">
          Lỗi cấu hình: {configError instanceof Error ? configError.message : "Không xác định"}
        </p>
      </AdminPageShell>
    );
  }
  if (recordError) {
    if (isNotFoundHttpError(recordError)) {
      return (
        <AdminPageShell>
          <HttpErrorView code={404} />
        </AdminPageShell>
      );
    }
    return (
      <AdminPageShell>
        <p className="text-destructive">
          Lỗi bản ghi: {recordError instanceof Error ? recordError.message : "Không xác định"}
        </p>
      </AdminPageShell>
    );
  }
  if (!config || !record) {
    return (
      <AdminPageShell>
        <p>Không tìm thấy dữ liệu.</p>
      </AdminPageShell>
    );
  }

  const breadcrumbs = resolveBackofficeBreadcrumbs(location.pathname, [{ label: "Sửa" }]);

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
    if (!validate() || !id) return;

    // For inventory-providers the custom form manages conditional/extra fields;
    // send the whole values map (generic CRUD backend accepts Record<string,any>).
    let payload: Record<string, unknown>;
    if (entityKey === "inventory-providers" || entityKey === "inventory-items") {
      payload = sanitizeCrudPayload(editableFields, values, "update");
    } else {
      payload = buildCrudPayload(editableFields, values, "update");
    }

    try {
      await updateMutation.mutateAsync({ id, body: payload });
      toast.success(`Đã cập nhật ${config.displayName}.`);

      const mode = saveModeRef.current;
      saveModeRef.current = "save";

      if (entityKey === "inventory-items") {
        if (mode === "save-and-clone") {
          // Navigate with only the ID — CrudCreatePage fetches the full record via useCrudRecord.
          navigate(`/admin/inventory-items/new`, { state: { cloneFromId: id } });
        } else if (mode === "save-and-new") {
          navigate(`/admin/inventory-items/new`);
        } else {
          navigateBackToList();
        }
      } else if (listReturnRef.current) {
        navigateBackToList();
      } else {
        navigate(`/admin/${entityKey}/${id}`, { replace: true });
      }
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <AdminPageShell>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={`Sửa ${config.displayName}`}
          breadcrumbs={breadcrumbs}
        />
        {entityKey !== "inventory-items" && (
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(`/admin/${entityKey}/${id}`)}>
              Huỷ
            </Button>
            <Button type="submit" form="crud-edit-form" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
        <form id="crud-edit-form" ref={formRef} onSubmit={(e) => void handleSubmit(e)}>
          {entityKey === "inventory-providers" ? (
            <SupplierCreateForm
              editableFields={editableFields}
              values={values}
              setValues={setValues}
              errors={errors}
              setErrors={setErrors}
              entityKey={entityKey!}
              isSaving={updateMutation.isPending}
            />
          ) : entityKey === "inventory-items" ? (
            <InventoryItemCreateForm
              editableFields={editableFields}
              values={values}
              setValues={setValues}
              errors={errors}
              setErrors={setErrors}
              entityKey={entityKey!}
              isSaving={updateMutation.isPending}
              mode="edit"
              initialRecord={record}
              onCancel={navigateBackToList}
              onSaveMode={handleSaveMode}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {editableFields.map((field) => {
                // Đơn vị tính: "Trạng thái" đổi thành "Ngừng theo dõi" (đảo isActive),
                // nhất quán với modal cập nhật đơn vị tính.
                if (isUnit && field.key === "isActive") {
                  const inputId = "edit-unit-inactive";
                  return (
                    <div key={field.key} className="md:col-span-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          id={inputId}
                          type="checkbox"
                          className="h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-input accent-primary"
                          checked={values.isActive === false}
                          onChange={(e) =>
                            setValues((prev) => ({ ...prev, isActive: !e.target.checked }))
                          }
                        />
                        <span className="cursor-pointer select-none font-medium">
                          Ngừng theo dõi
                        </span>
                      </label>
                    </div>
                  );
                }
                return (
                  <div key={field.key} className={field.key === "description" ? "md:col-span-2" : undefined}>
                    <CrudFieldInput
                      inputIdPrefix="edit"
                      field={field}
                      value={values[field.key]}
                      error={errors[field.key]}
                      entityKey={entityKey}
                      currentRecordId={id}
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
                );
              })}
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
