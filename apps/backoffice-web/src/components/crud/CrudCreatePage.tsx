import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@erp/ui";
import { useCrudConfig, useCrudCreate } from "./useCrudApi";
import { CrudFieldInput } from "./CrudFieldInput";
import { InventoryItemCreateForm } from "./inventory/InventoryItemCreateForm";
import { AdminPageShell } from "../layout/AdminPageShell";
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

    // For inventory-items the form maintains extra keys (barcodes/units/providers/
    // threshold/initialStock/...) in `values` that aren't part of `editableFields`.
    // Send the whole values map; the API DTO's whitelist rejects unknown keys.
    let payload: Record<string, unknown>;
    if (entityKey === "inventory-items") {
      payload = { ...values };
    } else {
      payload = {};
      editableFields.forEach((field) => {
        payload[field.key] = values[field.key];
      });
    }

    await createMutation.mutateAsync(payload);
    navigate(`/admin/${entityKey}`, { replace: true });
  };

  return (
    <AdminPageShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <nav
            aria-label="Điều hướng trang"
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <span>/</span>}
                {crumb.to && index !== breadcrumbs.length - 1 ? (
                  <Link className="hover:text-foreground hover:underline" to={crumb.to}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={index === breadcrumbs.length - 1 ? "font-semibold text-foreground" : ""}>
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
          <h1 className="mt-1 text-2xl font-semibold">Thêm mới {config.displayName}</h1>
        </div>
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
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {editableFields.map((field) => (
                <CrudFieldInput
                  key={field.key}
                  inputIdPrefix="create"
                  field={field}
                  value={values[field.key]}
                  error={errors[field.key]}
                  onChange={(nextValue) => {
                    setValues((prev) => ({ ...prev, [field.key]: nextValue }));
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next[field.key];
                      return next;
                    });
                  }}
                />
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

