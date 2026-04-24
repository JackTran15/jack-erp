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
  [RegistrationStatus.PENDING_APPROVAL]: "Pending Approval",
  [RegistrationStatus.APPROVED]: "Approved",
  [RegistrationStatus.REJECTED]: "Rejected",
  [RegistrationStatus.RESUBMITTED]: "Resubmitted",
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
            setError("Registration request not found");
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
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
        <p>Loading…</p>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Registration Detail</h2>
        <p style={{ color: "#c62828" }}>{error ?? "Not found"}</p>
        <button type="button" onClick={() => navigate(-1)} style={{ cursor: "pointer" }}>
          Back
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
      setError(err instanceof Error ? err.message : "Approve failed");
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
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActionLoading(false);
    }
  };

  const typeName =
    record.type === RegistrationType.ORGANIZATION ? "Organization" : "Branch";

  const requestDataEntries = Object.entries(record.requestData);

  const timeline: { label: string; date: string }[] = [
    { label: "Submitted", date: record.createdAt },
  ];
  if (record.reviewedAt) {
    const action =
      record.status === RegistrationStatus.APPROVED ? "Approved" : "Rejected";
    timeline.push({ label: action, date: record.reviewedAt });
  }

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{ marginBottom: 16, cursor: "pointer" }}
      >
        &larr; Back
      </button>

      <h2>{typeName} Registration Detail</h2>

      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <p>
          <strong>ID:</strong> {record.id}
        </p>
        <p>
          <strong>Type:</strong> {typeName}
        </p>
        <p>
          <strong>Status:</strong>{" "}
          <span
            style={{ color: STATUS_COLORS[record.status], fontWeight: 600 }}
          >
            {STATUS_LABELS[record.status]}
          </span>
        </p>
        {record.rejectionReason && (
          <p>
            <strong>Rejection Reason:</strong> {record.rejectionReason}
          </p>
        )}

        <h3>Request Data</h3>
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
        <h3 style={{ marginTop: 0 }}>Timeline</h3>
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
                {new Date(event.date).toLocaleString()}
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
            {actionLoading ? "Approving…" : "Approve"}
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
            Reject
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
          <h3 style={{ marginTop: 0 }}>Reject Registration</h3>
          <label>
            <span
              style={{ display: "block", marginBottom: 4, fontWeight: 500 }}
            >
              Reason (required, min 5 characters)
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
              {actionLoading ? "Rejecting…" : "Confirm Reject"}
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
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
