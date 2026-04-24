import { useState, useEffect, useCallback } from "react";
import { http } from "../../lib/http";

interface Assignment {
  id: string;
  userId: string;
  branchId: string;
  assignedAt: string;
  assignedBy: string;
}

interface Branch {
  id: string;
  name: string;
}

interface BranchListResponse {
  data: Branch[];
  total: number;
}

export function SalesHierarchyPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  const [salesmen, setSalesmen] = useState<Assignment[]>([]);
  const [managers, setManagers] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);

  const [salesmanUserId, setSalesmanUserId] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    http
      .get<BranchListResponse>("/api/v1/branches?pageSize=200")
      .then((res) => setBranches(res.data))
      .catch(() => setError("Failed to load branches"));
  }, []);

  const reload = useCallback(async () => {
    if (!selectedBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([
        http.get<Assignment[]>(`/api/v1/branches/${selectedBranchId}/salesmen`),
        http.get<Assignment[]>(
          `/api/v1/branches/${selectedBranchId}/sales-managers`
        ),
      ]);
      setSalesmen(s);
      setManagers(m);
    } catch {
      setError("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAssignSalesman = async () => {
    if (!salesmanUserId.trim() || !selectedBranchId) return;
    setError(null);
    try {
      await http.post(`/api/v1/branches/${selectedBranchId}/salesmen/assign`, {
        userId: salesmanUserId.trim(),
      });
      setSalesmanUserId("");
      reload();
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to assign salesman");
    }
  };

  const handleUnassignSalesman = async (userId: string) => {
    if (!selectedBranchId) return;
    setError(null);
    try {
      await http.post(
        `/api/v1/branches/${selectedBranchId}/salesmen/unassign`,
        { userId }
      );
      reload();
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to unassign salesman");
    }
  };

  const handleAssignManager = async () => {
    if (!managerUserId.trim() || !selectedBranchId) return;
    setError(null);
    try {
      await http.post(
        `/api/v1/branches/${selectedBranchId}/sales-managers/assign`,
        { userId: managerUserId.trim() }
      );
      setManagerUserId("");
      reload();
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to assign sales manager");
    }
  };

  const handleUnassignManager = async (userId: string) => {
    if (!selectedBranchId) return;
    setError(null);
    try {
      await http.post(
        `/api/v1/branches/${selectedBranchId}/sales-managers/unassign`,
        { userId }
      );
      reload();
    } catch (err: any) {
      setError(err?.error?.message ?? "Failed to unassign sales manager");
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Sales Hierarchy Management</h1>

      <div style={styles.branchSelector}>
        <label style={styles.label}>Branch</label>
        <select
          style={styles.select}
          value={selectedBranchId}
          onChange={(e) => setSelectedBranchId(e.target.value)}
        >
          <option value="">Select a branch…</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {!selectedBranchId && (
        <p style={styles.placeholder}>
          Select a branch to manage its sales hierarchy.
        </p>
      )}

      {selectedBranchId && loading && <p style={styles.loading}>Loading…</p>}

      {selectedBranchId && !loading && (
        <div style={styles.sections}>
          {/* Salesmen Section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Salesmen</h2>

            <div style={styles.assignRow}>
              <input
                style={styles.input}
                type="text"
                placeholder="User ID to assign"
                value={salesmanUserId}
                onChange={(e) => setSalesmanUserId(e.target.value)}
              />
              <button style={styles.btnPrimary} onClick={handleAssignSalesman}>
                Assign
              </button>
            </div>

            {salesmen.length === 0 ? (
              <p style={styles.empty}>No salesmen assigned to this branch.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>User ID</th>
                    <th style={styles.th}>Assigned At</th>
                    <th style={styles.th}>Assigned By</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {salesmen.map((s) => (
                    <tr key={s.id} style={styles.tr}>
                      <td style={styles.td}>
                        <code>{s.userId}</code>
                      </td>
                      <td style={styles.td}>
                        {new Date(s.assignedAt).toLocaleString()}
                      </td>
                      <td style={styles.td}>
                        <code>{s.assignedBy}</code>
                      </td>
                      <td style={styles.td}>
                        <button
                          style={styles.btnDanger}
                          onClick={() => handleUnassignSalesman(s.userId)}
                        >
                          Unassign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Sales Managers Section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Sales Managers</h2>

            <div style={styles.assignRow}>
              <input
                style={styles.input}
                type="text"
                placeholder="User ID to assign"
                value={managerUserId}
                onChange={(e) => setManagerUserId(e.target.value)}
              />
              <button style={styles.btnPrimary} onClick={handleAssignManager}>
                Assign
              </button>
            </div>

            {managers.length === 0 ? (
              <p style={styles.empty}>
                No sales managers assigned to this branch.
              </p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>User ID</th>
                    <th style={styles.th}>Assigned At</th>
                    <th style={styles.th}>Assigned By</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {managers.map((m) => (
                    <tr key={m.id} style={styles.tr}>
                      <td style={styles.td}>
                        <code>{m.userId}</code>
                      </td>
                      <td style={styles.td}>
                        {new Date(m.assignedAt).toLocaleString()}
                      </td>
                      <td style={styles.td}>
                        <code>{m.assignedBy}</code>
                      </td>
                      <td style={styles.td}>
                        <button
                          style={styles.btnDanger}
                          onClick={() => handleUnassignManager(m.userId)}
                        >
                          Unassign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "24px 16px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  title: { margin: "0 0 20px", fontSize: 24, fontWeight: 600 },
  branchSelector: { marginBottom: 20 },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 4,
    color: "#344054",
  },
  select: {
    width: "100%",
    maxWidth: 400,
    padding: "8px 12px",
    fontSize: 14,
    border: "1px solid #d0d5dd",
    borderRadius: 6,
    outline: "none",
  },
  error: {
    padding: "10px 14px",
    background: "#fef3f2",
    border: "1px solid #fda29b",
    borderRadius: 6,
    color: "#b42318",
    fontSize: 14,
    marginBottom: 16,
  },
  placeholder: { color: "#667085", fontSize: 14 },
  loading: { color: "#667085", fontSize: 14 },
  sections: { display: "flex", flexDirection: "column", gap: 32 },
  section: {
    border: "1px solid #e4e7ec",
    borderRadius: 8,
    padding: 20,
  },
  sectionTitle: { margin: "0 0 16px", fontSize: 18, fontWeight: 600 },
  assignRow: { display: "flex", gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    maxWidth: 360,
    padding: "8px 12px",
    fontSize: 14,
    border: "1px solid #d0d5dd",
    borderRadius: 6,
    outline: "none",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "2px solid #e4e7ec",
    background: "#f9fafb",
    fontWeight: 600,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #f2f4f7" },
  td: { padding: "10px 12px", verticalAlign: "middle" },
  empty: { color: "#667085", fontSize: 14, marginTop: 0 },
  btnPrimary: {
    padding: "8px 16px",
    background: "#1570ef",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  btnDanger: {
    padding: "6px 14px",
    background: "#fff",
    color: "#b42318",
    border: "1px solid #fda29b",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  },
};
