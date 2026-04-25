import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { hasAnyPermission } from "../../lib/permissions";
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

const STATUS_COLORS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.PENDING_APPROVAL]: "#e6a817",
  [RegistrationStatus.APPROVED]: "#2e7d32",
  [RegistrationStatus.REJECTED]: "#c62828",
  [RegistrationStatus.RESUBMITTED]: "#1565c0",
};

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
      <div style={{ padding: 24 }}>
        <p>Đang tải…</p>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Chi tiết đăng ký</h2>
        <p style={{ color: "#c62828" }}>{error ?? "Không tìm thấy"}</p>
        <button type="button" onClick={() => navigate(-1)} style={{ cursor: "pointer" }}>
          Quay lại
        </button>
      </div>
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
    <div style={{ padding: 24, maxWidth: 700 }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{ marginBottom: 16, cursor: "pointer" }}
      >
        &larr; Quay lại
      </button>

      <h2>Chi tiết đăng ký {typeName}</h2>

      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <p>
          <strong>Mã:</strong> {record.id}
        </p>
        <p>
          <strong>Loại:</strong> {typeName}
        </p>
        <p>
          <strong>Trạng thái:</strong>{" "}
          <span
            style={{ color: STATUS_COLORS[record.status], fontWeight: 600 }}
          >
            {STATUS_LABELS[record.status]}
          </span>
        </p>
        {record.rejectionReason && (
          <p>
            <strong>Lý do từ chối:</strong> {record.rejectionReason}
          </p>
        )}

        <h3>Dữ liệu đăng ký</h3>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {requestDataEntries.map(([key, value]) => (
              <tr key={key} style={{ borderBottom: "1px solid #eee" }}>
                <td
                  style={{ padding: "6px 12px 6px 0", fontWeight: 500 }}
                >
                  {key}
                </td>
                <td style={{ padding: "6px 0" }}>{String(value ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Dòng thời gian</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {timeline.map((event) => (
            <li
              key={event.label}
              style={{
                padding: "8px 0",
                borderLeft: "2px solid #1565c0",
                paddingLeft: 16,
                marginBottom: 4,
              }}
            >
              <strong>{event.label}</strong>
              <br />
              <span style={{ fontSize: 14, color: "#555" }}>
                {new Date(event.date).toLocaleString("vi-VN")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {error && <p style={{ color: "#c62828" }}>{error}</p>}

      {canApprove && !rejectMode && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={actionLoading}
            onClick={handleApprove}
            style={{
              padding: "8px 20px",
              cursor: actionLoading ? "not-allowed" : "pointer",
              backgroundColor: "#2e7d32",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            {actionLoading ? "Đang duyệt…" : "Duyệt"}
          </button>
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            style={{
              padding: "8px 20px",
              cursor: "pointer",
              backgroundColor: "#c62828",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            Từ chối
          </button>
        </div>
      )}

      {canApprove && rejectMode && (
        <div
          style={{
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 20,
          }}
        >
          <h3 style={{ marginTop: 0 }}>Từ chối đăng ký</h3>
          <label>
            <span
              style={{ display: "block", marginBottom: 4, fontWeight: 500 }}
            >
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
              disabled={rejectReason.length < 5 || actionLoading}
              onClick={handleReject}
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
              {actionLoading ? "Đang từ chối…" : "Xác nhận từ chối"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false);
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
      )}
    </div>
  );
}
