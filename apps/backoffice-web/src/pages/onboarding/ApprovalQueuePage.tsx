import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AppModal, Button } from "@erp/ui";
import { hasAnyPermission } from "../../lib/permissions";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { AdminPageShell } from "../../components/layout/AdminPageShell";
import {
  StatusBadge as AppStatusBadge,
  type StatusBadgeVariant,
} from "../../components/status/StatusBadge";
import {
  useRegistration,
  RegistrationStatus,
  RegistrationType,
  type RegistrationRequestRecord,
  type RegistrationFilters,
} from "../../hooks/useRegistration";

const PERMISSIONS = ["org.registration.approve", "branch.registration.approve"];

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.PENDING_APPROVAL]: "Chờ phê duyệt",
  [RegistrationStatus.APPROVED]: "Đã duyệt",
  [RegistrationStatus.REJECTED]: "Đã từ chối",
  [RegistrationStatus.RESUBMITTED]: "Đã gửi lại",
};

const TYPE_LABELS: Record<RegistrationType, string> = {
  [RegistrationType.ORGANIZATION]: "Tổ chức",
  [RegistrationType.BRANCH]: "Chi nhánh",
};

type TypeFilter = "all" | "org" | "branch";
type StatusFilter = "all" | RegistrationStatus;

function getStatusVariant(status: RegistrationStatus): StatusBadgeVariant {
  if (status === RegistrationStatus.APPROVED) {
    return "success";
  }
  if (status === RegistrationStatus.REJECTED) {
    return "danger";
  }
  if (status === RegistrationStatus.RESUBMITTED) {
    return "info";
  }
  return "warning";
}

function StatusBadge({ status }: { status: RegistrationStatus }) {
  return (
    <AppStatusBadge variant={getStatusVariant(status)}>
      {STATUS_LABELS[status]}
    </AppStatusBadge>
  );
}

export function ApprovalQueuePage() {
  const navigate = useNavigate();
  const { listRegistrations, approveRegistration, rejectRegistration } =
    useRegistration();

  const [data, setData] = useState<RegistrationRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const canAccess = hasAnyPermission(...PERMISSIONS);
  const isPending = (status: RegistrationStatus) =>
    status === RegistrationStatus.PENDING_APPROVAL ||
    status === RegistrationStatus.RESUBMITTED;
  const summary = useMemo(() => {
    const pending = data.filter((row) => isPending(row.status)).length;
    const approved = data.filter(
      (row) => row.status === RegistrationStatus.APPROVED,
    ).length;
    const rejected = data.filter(
      (row) => row.status === RegistrationStatus.REJECTED,
    ).length;
    return { pending, approved, rejected, total: data.length };
  }, [data]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters: RegistrationFilters = { page: 1, pageSize: 50 };
      if (typeFilter !== "all") filters.type = typeFilter;
      if (statusFilter !== "all") filters.status = statusFilter;
      const res = await listRegistrations(filters);
      setData(res.data);
      toast.dismiss("approval-queue-list");
    } catch (err: unknown) {
      toast.error(getUserFacingApiErrorMessage(err), {
        id: "approval-queue-list",
        position: "bottom-right",
        duration: 6000,
      });
    } finally {
      setLoading(false);
    }
  }, [listRegistrations, typeFilter, statusFilter]);

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    void fetchData();
  }, [canAccess, fetchData]);

  useEffect(() => {
    if (canAccess) {
      toast.dismiss("approval-queue-no-permission");
      return;
    }
    toast.warning(
      "Bạn không có quyền xem hàng đợi phê duyệt. Liên hệ quản trị viên nếu cần truy cập.",
      {
        id: "approval-queue-no-permission",
        position: "bottom-right",
        duration: 6000,
      },
    );
  }, [canAccess]);

  if (!canAccess) {
    return (
      <AdminPageShell>
        <div className="p-6">
          <div className="max-w-xl rounded-lg border border-border bg-card p-5 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Hàng đợi phê duyệt
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Bạn chưa được cấp quyền phê duyệt đăng ký tổ chức hoặc chi nhánh.
              Vui lòng liên hệ quản trị viên hệ thống.
            </p>
          </div>
        </div>
      </AdminPageShell>
    );
  }

  const handleApprove = async (record: RegistrationRequestRecord) => {
    setActionLoading(record.id);
    try {
      await approveRegistration(record.id, record.type);
      await fetchData();
    } catch (err: unknown) {
      toast.error(getUserFacingApiErrorMessage(err), {
        id: "approval-queue-action",
        position: "bottom-right",
        duration: 6000,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectingId || rejectReason.length < 5) return;
    const record = data.find((r) => r.id === rejectingId);
    if (!record) return;

    setActionLoading(rejectingId);
    try {
      await rejectRegistration(rejectingId, rejectReason, record.type);
      setRejectingId(null);
      setRejectReason("");
      await fetchData();
    } catch (err: unknown) {
      toast.error(getUserFacingApiErrorMessage(err), {
        id: "approval-queue-action",
        position: "bottom-right",
        duration: 6000,
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AdminPageShell>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Hàng đợi phê duyệt
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Theo dõi và xử lý các yêu cầu đăng ký tổ chức, chi nhánh.
            </p>
          </div>
          <div className="grid grid-cols-4 overflow-hidden rounded-md border border-border text-sm">
            <div className="border-r border-border px-3 py-2">
              <div className="text-xs text-muted-foreground">Tất cả</div>
              <div className="font-semibold text-foreground">
                {summary.total}
              </div>
            </div>
            <div className="border-r border-border px-3 py-2">
              <div className="text-xs text-muted-foreground">Chờ duyệt</div>
              <div className="font-semibold text-amber-700">
                {summary.pending}
              </div>
            </div>
            <div className="border-r border-border px-3 py-2">
              <div className="text-xs text-muted-foreground">Đã duyệt</div>
              <div className="font-semibold text-green-700">
                {summary.approved}
              </div>
            </div>
            <div className="px-3 py-2">
              <div className="text-xs text-muted-foreground">Từ chối</div>
              <div className="font-semibold text-rose-700">
                {summary.rejected}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-col gap-1 text-sm font-medium text-foreground">
            Loại
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            >
              <option value="all">Tất cả</option>
              <option value="org">Tổ chức</option>
              <option value="branch">Chi nhánh</option>
            </select>
          </label>

          <label className="flex min-w-48 flex-col gap-1 text-sm font-medium text-foreground">
            Trạng thái
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">Tất cả</option>
              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden border border-border bg-card">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Đang tải...</div>
          ) : data.length === 0 ? (
            <div className="flex h-40 items-center justify-center border-t border-border bg-muted/20 text-sm font-medium text-muted-foreground">
              Không có yêu cầu đăng ký phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-muted/60 text-xs font-semibold uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3">Loại</th>
                    <th className="px-4 py-3">Tên</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Gửi lúc</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => {
                    const name =
                      row.type === RegistrationType.ORGANIZATION
                        ? ((row.requestData.organizationName as string) ?? "—")
                        : ((row.requestData.branchName as string) ?? "—");

                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b border-border transition-colors hover:bg-muted/40"
                        onClick={() =>
                          navigate(`/onboarding/approvals/${row.id}`, {
                            state: row,
                          })
                        }
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground">
                          {TYPE_LABELS[row.type]}
                        </td>
                        <td className="px-4 py-2.5 text-foreground">{name}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {new Date(row.createdAt).toLocaleDateString("vi-VN")}
                        </td>
                        <td
                          className="px-4 py-2.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isPending(row.status) && (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={actionLoading === row.id}
                                onClick={() => handleApprove(row)}
                                className="bg-green-600 text-white hover:bg-green-700"
                              >
                                {actionLoading === row.id ? "..." : "Duyệt"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => setRejectingId(row.id)}
                              >
                                Từ chối
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {rejectingId && (
          <AppModal
            open={Boolean(rejectingId)}
            onOpenChange={(open) => {
              if (!open) {
                setRejectingId(null);
                setRejectReason("");
              }
            }}
            title="Từ chối đăng ký"
            showFooter={false}
            bodyStretch={false}
            defaultWidth={440}
            defaultHeight={280}
          >
            <label className="block text-sm font-medium text-foreground">
              Lý do (bắt buộc, tối thiểu 5 ký tự)
              <textarea
                className="mt-2 min-h-28 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={
                  rejectReason.length < 5 || actionLoading === rejectingId
                }
                onClick={handleRejectSubmit}
              >
                {actionLoading === rejectingId
                  ? "Đang từ chối…"
                  : "Xác nhận từ chối"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason("");
                }}
              >
                Huỷ
              </Button>
            </div>
          </AppModal>
        )}
      </div>
    </AdminPageShell>
  );
}
