import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@erp/ui";
import { useCrudConfig, useCrudCreate } from "./useCrudApi";
import { CrudFieldInput } from "./CrudFieldInput";
import { InventoryItemCreateForm } from "./inventory/InventoryItemCreateForm";
import { resolveBackofficeBreadcrumbs } from "../layout/breadcrumbs";

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
  const [inventoryExtras, setInventoryExtras] = useState<Record<string, string>>({
    itemType: "",
    brand: "",
    barcode: "",
    description: "",
    unitConversionName: "",
    conversionRate: "1",
    sellPriceByUnit: "",
    purchasePriceByUnit: "",
  });

  useEffect(() => {
    if (!config) return;
    const defaults: Record<string, unknown> = {};
    editableFields.forEach((field) => {
      defaults[field.key] = field.type === "boolean" ? false : "";
    });
    setValues(defaults);
  }, [config, editableFields]);

  if (isLoading) return <PageShell><p>Đang tải cấu hình biểu mẫu…</p></PageShell>;
  if (error) {
    return (
      <PageShell>
        <p className="text-destructive">
          Lỗi tải cấu hình: {error instanceof Error ? error.message : "Không xác định"}
        </p>
      </PageShell>
    );
  }
  if (!config) return <PageShell><p>Không tìm thấy cấu hình thực thể.</p></PageShell>;

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

    const payload: Record<string, unknown> = {};
    editableFields.forEach((field) => {
      payload[field.key] = values[field.key];
    });

    await createMutation.mutateAsync(payload);
    navigate(`/admin/${entityKey}`, { replace: true });
  };

  return (
    <PageShell>
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(`/admin/${entityKey}`)}>
            Quay lại
          </Button>
          <Button
            type="submit"
            form="crud-create-form"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
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
              inventoryExtras={inventoryExtras}
              setInventoryExtras={setInventoryExtras}
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
    </PageShell>
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="w-full px-2 py-6 sm:px-3 lg:px-4">{children}</div>;
}
