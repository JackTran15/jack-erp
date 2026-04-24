import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { hasAnyPermission } from "../../lib/permissions";
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

const TYPE_LABELS: Record<RegistrationType, string> = {
  [RegistrationType.ORGANIZATION]: "Organization",
  [RegistrationType.BRANCH]: "Branch",
};

type TypeFilter = "all" | "org" | "branch";
type StatusFilter = "all" | RegistrationStatus;

export function ApprovalQueuePage() {
  const navigate = useNavigate();
  const { listRegistrations, approveRegistration, rejectRegistration } =
    useRegistration();

  const [data, setData] = useState<RegistrationRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: RegistrationFilters = { page: 1, pageSize: 50 };
      if (typeFilter !== "all") filters.type = typeFilter;
      if (statusFilter !== "all") filters.status = statusFilter;
      const res = await listRegistrations(filters);
      setData(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [listRegistrations, typeFilter, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!hasAnyPermission(...PERMISSIONS)) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Approval Queue</h2>
        <p style={{ color: "#c62828" }}>
          You do not have permission to view the approval queue.
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
      setError(err instanceof Error ? err.message : "Approve failed");
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
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Approval Queue</h2>

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <label>
          Type:{" "}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          >
            <option value="all">All</option>
            <option value="org">Organization</option>
            <option value="branch">Branch</option>
          </select>
        </label>

        <label>
          Status:{" "}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p style={{ color: "#c62828" }}>{error}</p>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : data.length === 0 ? (
        <p>No registration requests found.</p>
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
              <th style={{ padding: 8 }}>Type</th>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Submitted</th>
              <th style={{ padding: 8 }}>Actions</th>
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
                    {new Date(row.createdAt).toLocaleDateString()}
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
                            : "Approve"}
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
                          Reject
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
            <h3 style={{ marginTop: 0 }}>Reject Registration</h3>
            <label>
              <span style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
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
                {actionLoading === rejectingId ? "Rejecting…" : "Confirm Reject"}
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
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
