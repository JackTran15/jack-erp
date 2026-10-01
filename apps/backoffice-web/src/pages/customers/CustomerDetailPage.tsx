import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@erp/ui";
import { useCrudConfig, useCrudRecord } from "../../components/crud/useCrudApi";
import { CrudDetailBody } from "../../components/crud/CrudDetailView";
import { AdminPageShell } from "../../components/layout/AdminPageShell";
import { resolveBackofficeBreadcrumbs } from "../../components/layout/breadcrumbs";
import { isNotFoundHttpError } from "../../lib/not-found-http-error";
import { HttpErrorView } from "../errors/HttpErrorPage";
import { MembershipCardPanel } from "./_components/MembershipCardPanel";
import { PointHistoryTab } from "./_components/PointHistoryTab";
import { usePermissionCheck } from "../../hooks/usePermissionCheck";

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { has } = usePermissionCheck(["customer.points.history.read"]);

  const { data: config, isLoading: configLoading, error: configError } = useCrudConfig("customers");
  const {
    data: record,
    isLoading: recordLoading,
    error: recordError,
  } = useCrudRecord("customers", id, Boolean(id));

  if (configLoading) {
    return <AdminPageShell><p>Đang tải cấu hình…</p></AdminPageShell>;
  }
  if (configError) {
    if (isNotFoundHttpError(configError)) {
      return <AdminPageShell><HttpErrorView code={404} /></AdminPageShell>;
    }
    return (
      <AdminPageShell>
        <p className="text-destructive">
          Lỗi: {configError instanceof Error ? configError.message : "Không tải được"}
        </p>
      </AdminPageShell>
    );
  }
  if (!config) {
    return <AdminPageShell><p>Không tìm thấy thực thể.</p></AdminPageShell>;
  }
  if (recordError && !recordLoading && isNotFoundHttpError(recordError)) {
    return <AdminPageShell><HttpErrorView code={404} /></AdminPageShell>;
  }

  const breadcrumbs = resolveBackofficeBreadcrumbs(location.pathname, [{ label: "Chi tiết" }]);

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
          <h1 className="mt-1 text-2xl font-semibold">Chi tiết Khách hàng</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/admin/customers")}>
            Quay lại danh sách
          </Button>
          <Button type="button" onClick={() => navigate(`/admin/customers/${id}/edit`)}>
            Sửa
          </Button>
        </div>
      </div>

      {recordLoading && <p className="text-muted-foreground">Đang tải bản ghi…</p>}
      {recordError && (
        <p className="text-destructive">
          {recordError instanceof Error ? recordError.message : "Không tải được bản ghi."}
        </p>
      )}
      {record && !recordLoading && (
        <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
          <CrudDetailBody config={config} record={record} />
        </div>
      )}

      {id && (
        <div className="mt-6">
          <MembershipCardPanel customerId={id} />
        </div>
      )}
      {id && has("customer.points.history.read") && (
        <div className="mt-6">
          <PointHistoryTab customerId={id} />
        </div>
      )}
    </AdminPageShell>
  );
}
