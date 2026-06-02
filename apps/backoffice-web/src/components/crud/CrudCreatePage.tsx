import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@erp/ui";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { useCrudConfig, useCrudCreate } from "./useCrudApi";
import { CrudFieldInput } from "./CrudFieldInput";
import { InventoryItemCreateForm } from "./inventory/InventoryItemCreateForm";
import { SupplierCreateForm } from "./inventory/SupplierCreateForm";
import { AdminPageShell } from "../layout/AdminPageShell";
import { PageHeader } from "../layout/PageHeader";
import { resolveBackofficeBreadcrumbs } from "../layout/breadcrumbs";
import { isNotFoundHttpError } from "../../lib/not-found-http-error";
import { HttpErrorView } from "../../pages/errors/HttpErrorPage";

export function CrudCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { entityKey } = useParams<{ entityKey: string }>();

  const { data: config, isLoading, error } = useCrudConfig(entityKey!);
  const createMutation = useCrudCreate(entityKey!);

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

  useEffect(() => {
    if (!config) return;
    const defaults: Record<string, unknown> = {};
    editableFields.forEach((field) => {
      defaults[field.key] = field.type === "boolean" ? false : "";
    });
    setValues(defaults);
  }, [config, editableFields]);

  if (isLoading) {
    return (
      <AdminPageShell>
        <p>Loading…</p>
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
      payload = { ...values };
    } else {
      payload = {};
      editableFields.forEach((field) => {
        payload[field.key] = values[field.key];
      });
    }

    try {
      await createMutation.mutateAsync(payload);
      toast.success(`Đã tạo ${config.displayName}.`);
      navigate(`/admin/${entityKey}`, { replace: true });
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
            <Button type="submit" form="crud-create-form" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
        <form id="crud-create-form" onSubmit={handleSubmit}>
          {entityKey === "inventory-items" ? (
            <InventoryItemCreateForm
              editableFields={editableFields}
              values={values}
              setValues={setValues}
              errors={errors}
              setErrors={setErrors}
              entityKey={entityKey!}
              isSaving={createMutation.isPending}
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
