import { useState } from "react";
import { useReceivablesAging, usePayablesAging } from "../../hooks/useReportData";

type ReportType = "receivables" | "payables";

export function AgingReportPage() {
  const [reportType, setReportType] = useState<ReportType>("receivables");
  const [branchId, setBranchId] = useState("");

  const params = { branchId: branchId || undefined };

  const receivables = useReceivablesAging(params);
  const payables = usePayablesAging(params);
  const active = reportType === "receivables" ? receivables : payables;

  const { data, isLoading: loading, error, refetch } = active;

  const handleExportCsv = () => {
    if (!data) return;
    const headers = ["Kỳ", "Số tiền"];
    const rows = [
      ["Hiện hành", data.current],
      ["1-30 ngày", data.days30],
      ["31-60 ngày", data.days60],
      ["61-90 ngày", data.days90],
      ["Trên 90 ngày", data.over90],
      ["Tổng", data.total],
    ];
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType}-aging-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Báo cáo tuổi nợ</h1>
        <button style={styles.btnSecondary} onClick={handleExportCsv} disabled={!data}>
          Xuất CSV
        </button>
      </div>

      <div style={styles.filters}>
        <label style={styles.filterLabel}>
          Loại
          <select
            style={styles.input}
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
          >
            <option value="receivables">Phải thu</option>
            <option value="payables">Phải trả</option>
          </select>
        </label>
        <label style={styles.filterLabel}>
          ID chi nhánh
          <input style={styles.input} type="text" placeholder="Tất cả chi nhánh" value={branchId} onChange={(e) => setBranchId(e.target.value)} />
        </label>
        <button style={styles.btn} onClick={() => void refetch()}>Làm mới</button>
      </div>

      {error && <p style={styles.error}>{error instanceof Error ? error.message : "Tải dữ liệu thất bại"}</p>}
      {loading && <p style={styles.muted}>Đang tải…</p>}

      {data && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Kỳ nợ</th>
                <th style={styles.thRight}>Số tiền</th>
              </tr>
            </thead>
            <tbody>
              <tr style={styles.tr}>
                <td style={styles.td}>Hiện hành (chưa đến hạn)</td>
                <td style={styles.tdRight}>{fmt(data.current)}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Quá hạn 1 – 30 ngày</td>
                <td style={styles.tdRight}>{fmt(data.days30)}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Quá hạn 31 – 60 ngày</td>
                <td style={styles.tdRight}>{fmt(data.days60)}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Quá hạn 61 – 90 ngày</td>
                <td style={styles.tdRight}>{fmt(data.days90)}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Quá hạn trên 90 ngày</td>
                <td style={styles.tdRight}>{fmt(data.over90)}</td>
              </tr>
              <tr style={{ ...styles.tr, background: "#f9fafb" }}>
                <td style={{ ...styles.td, fontWeight: 700 }}>Tổng còn nợ</td>
                <td style={{ ...styles.tdRight, fontWeight: 700 }}>{fmt(data.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p style={styles.generatedAt}>
          Tạo lúc: {new Date(data.generatedAt).toLocaleString("vi-VN")}
          {data.branchId ? ` | Chi nhánh: ${data.branchId}` : " | Gộp toàn hệ thống"}
        </p>
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
  generatedAt: { fontSize: 12, color: "#98a2b3", marginTop: 8 },
};
