import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@erp/ui";
import { toast } from "sonner";
import { useCrudConfig, useCrudRecord, useCrudUpdate } from "./useCrudApi";
import { CrudFieldInput } from "./CrudFieldInput";
import { AdminPageShell } from "../layout/AdminPageShell";
import { resolveBackofficeBreadcrumbs } from "../layout/breadcrumbs";
import { isNotFoundHttpError } from "../../lib/not-found-http-error";
import { HttpErrorView } from "../../pages/errors/HttpErrorPage";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";

export function CrudEditPage() {
  const { entityKey, id } = useParams<{ entityKey: string; id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => {
    if (!record) return;
    const next: Record<string, unknown> = {};
    editableFields.forEach((field) => {
      next[field.key] = record[field.key];
    });
    setValues(next);
    setErrors({});
  }, [record, editableFields]);

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
          Lỗi bản ghi: {recordError instanceof Error ? recordError.message : "Không tải được"}
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

    const payload: Record<string, unknown> = {};
    editableFields.forEach((field) => {
      payload[field.key] = values[field.key];
    });

    try {
      await updateMutation.mutateAsync({ id, body: payload });
      toast.success(`Đã cập nhật ${config.displayName}.`);
      navigate(`/admin/${entityKey}/${id}`, { replace: true });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <AdminPageShell>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav
            aria-label="Điều hướng trang"
            className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          >
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const href = crumb.to;
              const showLink = Boolean(href) && !isLast;
              return (
                <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <span>/</span> : null}
                  {showLink && href ? (
                    <Link className="hover:text-foreground hover:underline" to={href}>
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? "font-semibold text-foreground" : ""}>{crumb.label}</span>
                  )}
                </span>
              );
            })}
          </nav>
          <h1 className="mt-1 text-2xl font-semibold">Sửa {config.displayName}</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(`/admin/${entityKey}/${id}`)}>
            Huỷ
          </Button>
          <Button type="submit" form="crud-edit-form" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
        <form id="crud-edit-form" onSubmit={(e) => void handleSubmit(e)} className="grid gap-4 md:grid-cols-2">
          {editableFields.map((field) => (
            <div key={field.key} className={field.key === "description" ? "md:col-span-2" : undefined}>
              <CrudFieldInput
                inputIdPrefix="edit"
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
            </div>
          ))}
        </form>
      </div>
    </AdminPageShell>
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
