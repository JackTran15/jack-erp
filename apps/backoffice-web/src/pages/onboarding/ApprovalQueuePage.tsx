import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { hasAnyPermission } from "../../lib/permissions";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import {
  useRegistration,
  RegistrationStatus,
  RegistrationType,
  type RegistrationRequestRecord,
  type RegistrationFilters,
} from "../../hooks/useRegistration";

const PERMISSIONS = [
  "org.registration.approve",
  "branch.registration.approve",
];

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.PENDING_APPROVAL]: "Chờ phê duyệt",
  [RegistrationStatus.APPROVED]: "Đã duyệt",
  [RegistrationStatus.REJECTED]: "Đã từ chối",
  [RegistrationStatus.RESUBMITTED]: "Đã gửi lại",
};

const STATUS_COLORS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.PENDING_APPROVAL]: "#e6a817",
  [RegistrationStatus.APPROVED]: "#2e7d32",
  [RegistrationStatus.REJECTED]: "#c62828",
  [RegistrationStatus.RESUBMITTED]: "#1565c0",
};

const TYPE_LABELS: Record<RegistrationType, string> = {
  [RegistrationType.ORGANIZATION]: "Tổ chức",
  [RegistrationType.BRANCH]: "Chi nhánh",
};

type TypeFilter = "all" | "org" | "branch";
type StatusFilter = "all" | RegistrationStatus;

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
      <div style={{ padding: 24, maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Hàng đợi phê duyệt</h2>
        <p style={{ color: "#667085", lineHeight: 1.6 }}>
          Bạn chưa được cấp quyền phê duyệt đăng ký tổ chức hoặc chi nhánh. Vui lòng
          liên hệ quản trị viên hệ thống.
        </p>
      </div>
    );
  }

  const isPending = (status: RegistrationStatus) =>
    status === RegistrationStatus.PENDING_APPROVAL ||
    status === RegistrationStatus.RESUBMITTED;

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
    <div style={{ padding: 24 }}>
      <h2>Hàng đợi phê duyệt</h2>

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <label>
          Loại:{" "}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          >
            <option value="all">Tất cả</option>
            <option value="org">Tổ chức</option>
            <option value="branch">Chi nhánh</option>
          </select>
        </label>

        <label>
          Trạng thái:{" "}
          <select
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

      {loading ? (
        <p>Đang tải…</p>
      ) : data.length === 0 ? (
        <p>Không có yêu cầu đăng ký.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            textAlign: "left",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "2px solid #ccc" }}>
              <th style={{ padding: 8 }}>Loại</th>
              <th style={{ padding: 8 }}>Tên</th>
              <th style={{ padding: 8 }}>Trạng thái</th>
              <th style={{ padding: 8 }}>Gửi lúc</th>
              <th style={{ padding: 8 }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const name =
                row.type === RegistrationType.ORGANIZATION
                  ? (row.requestData.organizationName as string) ?? "—"
                  : (row.requestData.branchName as string) ?? "—";

              return (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: "1px solid #eee",
                    cursor: "pointer",
                  }}
                  onClick={() => navigate(`/onboarding/approvals/${row.id}`, { state: row })}
                >
                  <td style={{ padding: 8 }}>{TYPE_LABELS[row.type]}</td>
                  <td style={{ padding: 8 }}>{name}</td>
                  <td style={{ padding: 8 }}>
                    <span
                      style={{
                        color: STATUS_COLORS[row.status],
                        fontWeight: 600,
                      }}
                    >
                      {STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td style={{ padding: 8 }}>
                    {new Date(row.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td
                    style={{ padding: 8 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isPending(row.status) && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          disabled={actionLoading === row.id}
                          onClick={() => handleApprove(row)}
                          style={{
                            padding: "4px 12px",
                            cursor: "pointer",
                            backgroundColor: "#2e7d32",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                          }}
                        >
                          {actionLoading === row.id
                            ? "…"
                            : "Duyệt"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectingId(row.id)}
                          style={{
                            padding: "4px 12px",
                            cursor: "pointer",
                            backgroundColor: "#c62828",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                          }}
                        >
                          Từ chối
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {rejectingId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 24,
              borderRadius: 8,
              minWidth: 360,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Từ chối đăng ký</h3>
            <label>
              <span style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Lý do (bắt buộc, tối thiểu 5 ký tự)
              </span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                disabled={
                  rejectReason.length < 5 || actionLoading === rejectingId
                }
                onClick={handleRejectSubmit}
                style={{
                  padding: "8px 16px",
                  cursor:
                    rejectReason.length < 5 ? "not-allowed" : "pointer",
                  backgroundColor: "#c62828",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                }}
              >
                {actionLoading === rejectingId ? "Đang từ chối…" : "Xác nhận từ chối"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason("");
                }}
                style={{
                  padding: "8px 16px",
                  cursor: "pointer",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: "none",
                }}
              >
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
