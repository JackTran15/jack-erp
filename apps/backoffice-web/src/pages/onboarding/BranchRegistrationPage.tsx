import { useState, type FormEvent } from "react";
import { hasPermission } from "../../lib/permissions";
import {
  useRegistration,
  RegistrationStatus,
  type SubmitBranchRegistrationData,
  type RegistrationRequestRecord,
} from "../../hooks/useRegistration";

const PERMISSION = "branch.registration.submit";

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

export function BranchRegistrationPage() {
  const { submitBranchRegistration } = useRegistration();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegistrationRequestRecord | null>(null);

  const [form, setForm] = useState<SubmitBranchRegistrationData>({
    branchName: "",
    address: "",
    phone: "",
    email: "",
    parentBranchId: "",
  });

  if (!hasPermission(PERMISSION)) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Branch Registration</h2>
        <p style={{ color: "#c62828" }}>
          You do not have permission to submit branch registrations.
        </p>
      </div>
    );
  }

  const handleChange = (field: keyof SubmitBranchRegistrationData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data: Record<string, unknown> = { branchName: form.branchName };
      if (form.address) data.address = form.address;
      if (form.phone) data.phone = form.phone;
      if (form.email) data.email = form.email;
      if (form.parentBranchId) data.parentBranchId = form.parentBranchId;
      const res = await submitBranchRegistration(
        data as unknown as SubmitBranchRegistrationData,
      );
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Branch Registration</h2>
        <div
          style={{
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 20,
            maxWidth: 500,
          }}
        >
          <h3>Request Submitted</h3>
          <p>
            <strong>ID:</strong> {result.id}
          </p>
          <p>
            <strong>Status:</strong>{" "}
            <span style={{ color: STATUS_COLORS[result.status], fontWeight: 600 }}>
              {STATUS_LABELS[result.status]}
            </span>
          </p>
          <p>
            <strong>Submitted:</strong>{" "}
            {new Date(result.createdAt).toLocaleString()}
          </p>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setForm({
                branchName: "",
                address: "",
                phone: "",
                email: "",
                parentBranchId: "",
              });
            }}
            style={{ marginTop: 12, padding: "8px 16px", cursor: "pointer" }}
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Branch Registration</h2>
      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: 500,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <label>
          <span style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
            Branch Name *
          </span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={200}
            value={form.branchName}
            onChange={(e) => handleChange("branchName", e.target.value)}
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </label>

        <label>
          <span style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
            Address
          </span>
          <input
            type="text"
            maxLength={500}
            value={form.address}
            onChange={(e) => handleChange("address", e.target.value)}
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </label>

        <label>
          <span style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
            Phone
          </span>
          <input
            type="tel"
            maxLength={30}
            value={form.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </label>

        <label>
          <span style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
            Email
          </span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => handleChange("email", e.target.value)}
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </label>

        <label>
          <span style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
            Parent Branch ID
          </span>
          <input
            type="text"
            placeholder="UUID of parent branch (optional)"
            value={form.parentBranchId}
            onChange={(e) => handleChange("parentBranchId", e.target.value)}
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </label>

        {error && <p style={{ color: "#c62828", margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 20px",
            cursor: submitting ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {submitting ? "Submitting…" : "Submit Registration"}
        </button>
      </form>
    </div>
  );
}
