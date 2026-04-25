import { useState } from "react";
import { useCashReconciliation } from "../../hooks/useReportData";

export function CashReportPage() {
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const { data = [], isLoading: loading, error, refetch } = useCashReconciliation({
    branchId: branchId || undefined,
    startDate,
    endDate,
  });

  const handleExportCsv = () => {
    if (data.length === 0) return;
    const headers = ["Phiên", "Chi nhánh", "Dự kiến", "Thực tế", "Chênh lệch", "Đối soát lúc"];
    const rows = data.map((r) => [
      r.sessionId,
      r.branchId,
      r.expectedBalance,
      r.actualBalance,
      r.discrepancy,
      r.reconciledAt,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalVariance = data.reduce((sum, r) => sum + r.discrepancy, 0);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Đối soát quỹ</h1>
        <button style={styles.btnSecondary} onClick={handleExportCsv} disabled={data.length === 0}>
          Xuất CSV
        </button>
      </div>

      <div style={styles.filters}>
        <label style={styles.filterLabel}>
          ID chi nhánh
          <input style={styles.input} type="text" placeholder="Tất cả chi nhánh" value={branchId} onChange={(e) => setBranchId(e.target.value)} />
        </label>
        <label style={styles.filterLabel}>
          Từ ngày
          <input style={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label style={styles.filterLabel}>
          Đến ngày
          <input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button style={styles.btn} onClick={() => void refetch()}>Làm mới</button>
      </div>

      {error && <p style={styles.error}>{error instanceof Error ? error.message : "Tải dữ liệu thất bại"}</p>}
      {loading && <p style={styles.muted}>Đang tải…</p>}

      {!loading && data.length === 0 && <p style={styles.muted}>Không có bản ghi đối soát.</p>}

      {data.length > 0 && (
        <>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID phiên</th>
                  <th style={styles.th}>Chi nhánh</th>
                  <th style={styles.thRight}>Dự kiến</th>
                  <th style={styles.thRight}>Thực tế</th>
                  <th style={styles.thRight}>Chênh lệch</th>
                  <th style={styles.th}>Đối soát lúc</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.sessionId} style={styles.tr}>
                    <td style={styles.td}>{row.sessionId.slice(0, 8)}…</td>
                    <td style={styles.td}>{row.branchId.slice(0, 8)}…</td>
                    <td style={styles.tdRight}>{fmt(row.expectedBalance)}</td>
                    <td style={styles.tdRight}>{fmt(row.actualBalance)}</td>
                    <td
                      style={{
                        ...styles.tdRight,
                        color: row.discrepancy === 0 ? "#2e7d32" : "#c62828",
                        fontWeight: 600,
                      }}
                    >
                      {fmt(row.discrepancy)}
                    </td>
                    <td style={styles.td}>
                      {new Date(row.reconciledAt).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f9fafb" }}>
                  <td colSpan={4} style={{ ...styles.td, fontWeight: 700 }}>
                    Tổng chênh lệch
                  </td>
                  <td
                    style={{
                      ...styles.tdRight,
                      fontWeight: 700,
                      color: totalVariance === 0 ? "#2e7d32" : "#c62828",
                    }}
                  >
                    {fmt(totalVariance)}
                  </td>
                  <td style={styles.td} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "USD" }).format(n);
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200, margin: "0 auto", padding: "24px 16px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { margin: 0, fontSize: 24, fontWeight: 600 },
  filters: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 24 },
  filterLabel: { display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 500, gap: 4, color: "#344054" },
  input: { padding: "8px 10px", border: "1px solid #d0d5dd", borderRadius: 6, fontSize: 14, outline: "none", minWidth: 160 },
  btn: { padding: "8px 16px", background: "#1570ef", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer" },
  btnSecondary: { padding: "8px 16px", background: "#fff", color: "#344054", border: "1px solid #d0d5dd", borderRadius: 6, fontSize: 14, cursor: "pointer" },
  error: { color: "#c62828", marginBottom: 12 },
  muted: { color: "#667085" },
  tableWrap: { overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e4e7ec", background: "#f9fafb", fontWeight: 600, fontSize: 13 },
  thRight: { textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e4e7ec", background: "#f9fafb", fontWeight: 600, fontSize: 13 },
  tr: { borderBottom: "1px solid #f2f4f7" },
  td: { padding: "10px 12px" },
  tdRight: { padding: "10px 12px", textAlign: "right" },
};
