import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge, Button } from "@erp/ui";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { useCrudConfig, useCrudRecord } from "../../components/crud/useCrudApi";
import { CrudDetailBody } from "../../components/crud/CrudDetailView";
import { AdminPageShell } from "../../components/layout/AdminPageShell";
import { resolveBackofficeBreadcrumbs } from "../../components/layout/breadcrumbs";
import { isNotFoundHttpError } from "../../lib/not-found-http-error";
import { HttpErrorView } from "../errors/HttpErrorPage";
import { apiClient } from "../../lib/api-axios";
import { IssueMembershipCardDialog } from "./IssueMembershipCardDialog";

interface MembershipSummary {
  cardNumber: string;
  tier: string;
  points: number;
  pointsUsed: number;
}

interface CustomerSummary {
  customerId: string;
  purchases: { totalSpending: number; invoiceCount: number };
  debt: { totalOutstanding: number; documentCount: number };
  membership: MembershipSummary | null;
}

const TIER_LABELS: Record<string, string> = {
  none: "Không hạng",
  silver: "Bạc",
  gold: "Vàng",
  diamond: "Kim Cương",
};

const TIER_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  none: "outline",
  silver: "secondary",
  gold: "default",
  diamond: "default",
};

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: config, isLoading: configLoading, error: configError } = useCrudConfig("customers");
  const {
    data: record,
    isLoading: recordLoading,
    error: recordError,
  } = useCrudRecord("customers", id, Boolean(id));

  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!id) return;
    setSummaryLoading(true);
    try {
      const { data } = await apiClient.get<CustomerSummary>(`/customers/${id}/summary`);
      setSummary(data);
    } catch {
      toast.error("Không tải được thông tin thẻ thành viên");
    } finally {
      setSummaryLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

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

      {/* Membership section */}
      <div className="mt-6 rounded-lg border border-border bg-background p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Thẻ thành viên</h2>
          </div>
          {!summaryLoading && summary?.membership === null && (
            <Button
              type="button"
              size="sm"
              onClick={() => setIssueDialogOpen(true)}
            >
              Cấp thẻ thành viên
            </Button>
          )}
        </div>

        {summaryLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : summary?.membership ? (
          <dl className="space-y-2">
            <div className="flex items-center gap-2">
              <dt className="w-36 text-xs font-medium text-muted-foreground">Mã thẻ</dt>
              <dd className="text-sm font-mono">{summary.membership.cardNumber}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="w-36 text-xs font-medium text-muted-foreground">Hạng thẻ</dt>
              <dd>
                <Badge variant={TIER_BADGE_VARIANT[summary.membership.tier] ?? "outline"}>
                  {TIER_LABELS[summary.membership.tier] ?? summary.membership.tier}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="w-36 text-xs font-medium text-muted-foreground">Điểm tích lũy</dt>
              <dd className="text-sm">{summary.membership.points.toLocaleString("vi-VN")} điểm</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="w-36 text-xs font-medium text-muted-foreground">Điểm đã dùng</dt>
              <dd className="text-sm">{summary.membership.pointsUsed.toLocaleString("vi-VN")} điểm</dd>
            </div>
          </dl>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">Chưa có thẻ</Badge>
            <span>Khách hàng này chưa được cấp thẻ thành viên.</span>
          </div>
        )}
      </div>

      {id && (
        <IssueMembershipCardDialog
          customerId={id}
          open={issueDialogOpen}
          onClose={() => setIssueDialogOpen(false)}
          onSuccess={() => void fetchSummary()}
        />
      )}
    </AdminPageShell>
  );
}
