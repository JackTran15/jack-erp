import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@erp/ui";
import { hasAnyPermission } from "../../lib/permissions";
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
} from "../../hooks/useRegistration";

const APPROVE_PERMISSIONS = [
  "org.registration.approve",
  "branch.registration.approve",
];

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.PENDING_APPROVAL]: "Chờ phê duyệt",
  [RegistrationStatus.APPROVED]: "Đã duyệt",
  [RegistrationStatus.REJECTED]: "Đã từ chối",
  [RegistrationStatus.RESUBMITTED]: "Đã gửi lại",
};

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

export function RegistrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { approveRegistration, rejectRegistration, listRegistrations } =
    useRegistration();

  const passedRecord = (location.state as RegistrationRequestRecord) ?? null;

  const [record, setRecord] = useState<RegistrationRequestRecord | null>(
    passedRecord,
  );
  const [loading, setLoading] = useState(!passedRecord);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (passedRecord || !id) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [orgs, branches] = await Promise.all([
          listRegistrations({ type: "org", page: 1, pageSize: 100 }),
          listRegistrations({ type: "branch", page: 1, pageSize: 100 }),
        ]);
        const all = [...orgs.data, ...branches.data];
        const found = all.find((r) => r.id === id);
        if (!cancelled) {
          if (found) {
            setRecord(found);
          } else {
            setError("Không tìm thấy yêu cầu đăng ký");
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Tải dữ liệu thất bại");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, passedRecord, listRegistrations]);

  if (loading) {
    return (
      <AdminPageShell>
        <div className="p-6 text-sm text-muted-foreground">Đang tải...</div>
      </AdminPageShell>
    );
  }

  if (error || !record) {
    return (
      <AdminPageShell>
        <div className="p-6">
          <div className="max-w-xl rounded-lg border border-border bg-card p-5 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Chi tiết đăng ký
            </h1>
            <p className="mt-2 text-sm font-medium text-destructive">
              {error ?? "Không tìm thấy"}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => navigate(-1)}
            >
              Quay lại
            </Button>
          </div>
        </div>
      </AdminPageShell>
    );
  }

  const isPending =
    record.status === RegistrationStatus.PENDING_APPROVAL ||
    record.status === RegistrationStatus.RESUBMITTED;

  const canApprove = hasAnyPermission(...APPROVE_PERMISSIONS) && isPending;

  const handleApprove = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const updated = await approveRegistration(record.id, record.type);
      setRecord(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Phê duyệt thất bại");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (rejectReason.length < 5) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await rejectRegistration(
        record.id,
        rejectReason,
        record.type,
      );
      setRecord(updated);
      setRejectMode(false);
      setRejectReason("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Từ chối thất bại");
    } finally {
      setActionLoading(false);
    }
  };

  const typeName =
    record.type === RegistrationType.ORGANIZATION ? "Tổ chức" : "Chi nhánh";

  const requestDataEntries = Object.entries(record.requestData);

  const timeline: { label: string; date: string }[] = [
    { label: "Đã gửi", date: record.createdAt },
  ];
  if (record.reviewedAt) {
    const action =
      record.status === RegistrationStatus.APPROVED ? "Đã duyệt" : "Đã từ chối";
    timeline.push({ label: action, date: record.reviewedAt });
  }

  return (
    <AdminPageShell>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Chi tiết đăng ký {typeName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Kiểm tra thông tin yêu cầu trước khi phê duyệt hoặc từ chối.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Quay lại
          </Button>
        </div>

        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="border border-border bg-card p-4">
            <div className="mb-4 grid gap-3 border-b border-border pb-4 text-sm md:grid-cols-3">
              <div className="grid gap-1">
                <span className="font-medium text-muted-foreground">Mã</span>
                <span className="break-all text-foreground">{record.id}</span>
              </div>
              <div className="grid gap-1">
                <span className="font-medium text-muted-foreground">Loại</span>
                <span className="text-foreground">{typeName}</span>
              </div>
              <div className="grid gap-1">
                <span className="font-medium text-muted-foreground">
                  Trạng thái
                </span>
                <span>
                  <StatusBadge status={record.status} />
                </span>
              </div>
            </div>

            {record.rejectionReason && (
              <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                <span className="font-semibold">Lý do từ chối:</span>{" "}
                {record.rejectionReason}
              </div>
            )}

            <h2 className="text-base font-semibold text-foreground">
              Dữ liệu đăng ký
            </h2>
            <div className="mt-3 overflow-hidden border border-border">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {requestDataEntries.map(([key, value]) => (
                    <tr
                      key={key}
                      className="border-b border-border last:border-0"
                    >
                      <td className="w-56 bg-muted/50 px-4 py-2.5 font-medium text-muted-foreground">
                        {key}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">
                        {String(value ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="grid content-start gap-4">
            <section className="border border-border bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">
                Dòng thời gian
              </h2>
              <ol className="mt-4 space-y-3">
                {timeline.map((event) => (
                  <li
                    key={event.label}
                    className="border-l-2 border-primary pl-4"
                  >
                    <div className="text-sm font-semibold text-foreground">
                      {event.label}
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      {new Date(event.date).toLocaleString("vi-VN")}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {(error || canApprove) && (
              <section className="border border-border bg-card p-4">
                <h2 className="text-base font-semibold text-foreground">
                  Thao tác
                </h2>
                {error && (
                  <p className="mt-3 text-sm font-medium text-destructive">
                    {error}
                  </p>
                )}

                {canApprove && !rejectMode && (
                  <div className="mt-4 grid gap-2">
                    <Button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleApprove}
                      className="bg-green-600 text-white hover:bg-green-700"
                    >
                      {actionLoading ? "Đang duyệt…" : "Duyệt"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setRejectMode(true)}
                    >
                      Từ chối
                    </Button>
                  </div>
                )}

                {canApprove && rejectMode && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-foreground">
                      Lý do (bắt buộc, tối thiểu 5 ký tự)
                      <textarea
                        className="mt-2 min-h-28 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={4}
                      />
                    </label>
                    <div className="mt-3 grid gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={rejectReason.length < 5 || actionLoading}
                        onClick={handleReject}
                      >
                        {actionLoading ? "Đang từ chối…" : "Xác nhận từ chối"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setRejectMode(false);
                          setRejectReason("");
                        }}
                      >
                        Huỷ
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>
    </AdminPageShell>
  );
}
