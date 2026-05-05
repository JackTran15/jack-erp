import { useState } from "react";
import { useSalesSummary } from "../../hooks/useReportData";
import { useQueryToast } from "../../hooks/useQueryToast";
import { AdminPageShell } from "../../components/layout/AdminPageShell";

export function SalesReportPage() {
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const {
    data,
    isLoading: loading,
    error,
    errorUpdatedAt,
    refetch,
  } = useSalesSummary({
    branchId: branchId || undefined,
    startDate,
    endDate,
  });

  useQueryToast(error ? { variant: "error", error } : null, {
    toastId: "report-sales-summary",
    updatedAt: errorUpdatedAt,
  });

  return (
    <AdminPageShell>
      <h1 style={styles.title}>Tổng hợp bán hàng</h1>

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

      {loading && <p style={styles.muted}>Đang tải…</p>}

      {data && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Chỉ tiêu</th>
                <th style={styles.th}>Giá trị</th>
              </tr>
            </thead>
            <tbody>
              <tr style={styles.tr}>
                <td style={styles.td}>Kỳ</td>
                <td style={styles.td}>
                  {new Date(data.periodStart).toLocaleDateString("vi-VN")} – {new Date(data.periodEnd).toLocaleDateString("vi-VN")}
                </td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Tổng bán</td>
                <td style={styles.td}>{fmt(data.totalSales)}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Số đơn bán</td>
                <td style={styles.td}>{data.saleCount}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Tổng trả hàng</td>
                <td style={styles.td}>{fmt(data.totalReturns)}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Số đơn trả</td>
                <td style={styles.td}>{data.returnCount}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Doanh thu ròng</td>
                <td style={{ ...styles.td, fontWeight: 700, color: "#2e7d32" }}>
                  {fmt(data.netRevenue)}
                </td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Giá trị đơn bán trung bình</td>
                <td style={styles.td}>{fmt(data.averageSaleValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </AdminPageShell>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "USD" }).format(n);
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200, margin: "0 auto", padding: "24px 16px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  title: { margin: "0 0 20px", fontSize: 24, fontWeight: 600 },
  filters: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 24 },
  filterLabel: { display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 500, gap: 4, color: "#344054" },
  input: { padding: "8px 10px", border: "1px solid #d0d5dd", borderRadius: 6, fontSize: 14, outline: "none", minWidth: 160 },
  btn: { padding: "8px 16px", background: "#1570ef", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer" },
  muted: { color: "#667085" },
  tableWrap: { overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e4e7ec", background: "#f9fafb", fontWeight: 600, fontSize: 13 },
  tr: { borderBottom: "1px solid #f2f4f7" },
  td: { padding: "10px 12px" },
};
