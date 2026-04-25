import { useState, useEffect, useCallback } from "react";
import { formatClientError } from "@erp/api-client";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";

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
    (async () => {
      const r = await erpApi.GET<BranchListResponse>("/branches", {
        params: { query: { pageSize: 200, page: 1 } },
      });
      if (r.error) {
        setError(
          `Không tải được danh sách chi nhánh: ${formatClientError(r.error)}`,
        );
        return;
      }
      if (r.data) setBranches(r.data.data);
    })();
  }, []);

  const reload = useCallback(async () => {
    if (!selectedBranchId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([
        requireErpData(
          await erpApi.GET<Assignment[]>(
            "/branches/{id}/salesmen",
            { params: { path: { id: selectedBranchId } } },
          ),
        ),
        requireErpData(
          await erpApi.GET<Assignment[]>(
            "/branches/{id}/sales-managers",
            { params: { path: { id: selectedBranchId } } },
          ),
        ),
      ]);
      setSalesmen(s);
      setManagers(m);
    } catch (err) {
      setError(
        `Không tải được phân công: ${err instanceof Error ? err.message : formatClientError(err)}`,
      );
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
      await requireErpData(
        await erpApi.POST("/branches/{id}/salesmen/assign", {
          params: { path: { id: selectedBranchId } },
          body: { userId: salesmanUserId.trim() },
        }),
      );
      setSalesmanUserId("");
      reload();
    } catch (err: any) {
      setError(err?.error?.message ?? "Gán nhân viên kinh doanh thất bại");
    }
  };

  const handleUnassignSalesman = async (userId: string) => {
    if (!selectedBranchId) return;
    setError(null);
    try {
      requireErpSuccess(
        await erpApi.POST("/branches/{id}/salesmen/unassign", {
          params: { path: { id: selectedBranchId } },
          body: { userId },
        }),
      );
      reload();
    } catch (err: any) {
      setError(err?.error?.message ?? "Bỏ gán nhân viên thất bại");
    }
  };

  const handleAssignManager = async () => {
    if (!managerUserId.trim() || !selectedBranchId) return;
    setError(null);
    try {
      await requireErpData(
        await erpApi.POST("/branches/{id}/sales-managers/assign", {
          params: { path: { id: selectedBranchId } },
          body: { userId: managerUserId.trim() },
        }),
      );
      setManagerUserId("");
      reload();
    } catch (err: any) {
      setError(err?.error?.message ?? "Gán quản lý kinh doanh thất bại");
    }
  };

  const handleUnassignManager = async (userId: string) => {
    if (!selectedBranchId) return;
    setError(null);
    try {
      requireErpSuccess(
        await erpApi.POST("/branches/{id}/sales-managers/unassign", {
          params: { path: { id: selectedBranchId } },
          body: { userId },
        }),
      );
      reload();
    } catch (err: any) {
      setError(err?.error?.message ?? "Bỏ gán quản lý thất bại");
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Quản lý cấp bậc kinh doanh</h1>

      <div style={styles.branchSelector}>
        <label style={styles.label}>Chi nhánh</label>
        <select
          style={styles.select}
          value={selectedBranchId}
          onChange={(e) => setSelectedBranchId(e.target.value)}
        >
          <option value="">Chọn chi nhánh…</option>
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
          Chọn một chi nhánh để quản lý cấp bậc kinh doanh.
        </p>
      )}

      {selectedBranchId && loading && <p style={styles.loading}>Đang tải…</p>}

      {selectedBranchId && !loading && (
        <div style={styles.sections}>
          {/* Salesmen Section */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Nhân viên kinh doanh</h2>

            <div style={styles.assignRow}>
              <input
                style={styles.input}
                type="text"
                placeholder="ID người dùng cần gán"
                value={salesmanUserId}
                onChange={(e) => setSalesmanUserId(e.target.value)}
              />
              <button style={styles.btnPrimary} onClick={handleAssignSalesman}>
                Gán
              </button>
            </div>

            {salesmen.length === 0 ? (
              <p style={styles.empty}>Chưa có nhân viên kinh doanh tại chi nhánh này.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID người dùng</th>
                    <th style={styles.th}>Gán lúc</th>
                    <th style={styles.th}>Người gán</th>
                    <th style={styles.th}>Thao tác</th>
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
                          Bỏ gán
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
            <h2 style={styles.sectionTitle}>Quản lý kinh doanh</h2>

            <div style={styles.assignRow}>
              <input
                style={styles.input}
                type="text"
                placeholder="ID người dùng cần gán"
                value={managerUserId}
                onChange={(e) => setManagerUserId(e.target.value)}
              />
              <button style={styles.btnPrimary} onClick={handleAssignManager}>
                Gán
              </button>
            </div>

            {managers.length === 0 ? (
              <p style={styles.empty}>
                Chưa có quản lý kinh doanh tại chi nhánh này.
              </p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID người dùng</th>
                    <th style={styles.th}>Gán lúc</th>
                    <th style={styles.th}>Người gán</th>
                    <th style={styles.th}>Thao tác</th>
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
                          Bỏ gán
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
