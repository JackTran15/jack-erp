import { useState } from "react";
import { useDashboard } from "../../hooks/useReportData";

export function DashboardReportPage() {
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const { data, isLoading: loading, error, refetch } = useDashboard({
    branchId: branchId || undefined,
    startDate,
    endDate,
  });

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Bảng điều khiển báo cáo</h1>

      <div style={styles.filters}>
        <label style={styles.filterLabel}>
          ID chi nhánh
          <input
            style={styles.input}
            type="text"
            placeholder="Để trống = gộp toàn hệ thống"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          />
        </label>
        <label style={styles.filterLabel}>
          Từ ngày
          <input
            style={styles.input}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label style={styles.filterLabel}>
          Đến ngày
          <input
            style={styles.input}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <button style={styles.btn} onClick={() => void refetch()}>
          Làm mới
        </button>
      </div>

      {error && <p style={styles.error}>{error instanceof Error ? error.message : "Không tải được bảng điều khiển"}</p>}
      {loading && <p style={styles.muted}>Đang tải…</p>}

      {data && (
        <div style={styles.cardGrid}>
          <SummaryCard label="Tổng bán hôm nay" value={fmt(data.totalSalesToday)} color="#1570ef" />
          <SummaryCard label="Tổng trả hàng hôm nay" value={fmt(data.totalReturnsToday)} color="#d32f2f" />
          <SummaryCard label="Doanh thu ròng" value={fmt(data.netRevenue)} color="#2e7d32" />
          <SummaryCard label="Phiên POS đang mở" value={String(data.openPosSessionCount)} color="#6941c6" />
          <SummaryCard label="Mặt hàng sắp hết" value={String(data.lowStockItemCount)} color="#dc6803" />
          <SummaryCard label="Công nợ phải thu" value={fmt(data.pendingReceivables)} color="#1570ef" />
          <SummaryCard label="Công nợ phải trả" value={fmt(data.pendingPayables)} color="#c4320a" />
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

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ ...styles.card, borderTop: `3px solid ${color}` }}>
      <span style={styles.cardLabel}>{label}</span>
      <span style={{ ...styles.cardValue, color }}>{value}</span>
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "USD",
  }).format(n);
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
  filters: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
    marginBottom: 24,
  },
  filterLabel: {
    display: "flex",
    flexDirection: "column",
    fontSize: 12,
    fontWeight: 500,
    gap: 4,
    color: "#344054",
  },
  input: {
    padding: "8px 10px",
    border: "1px solid #d0d5dd",
    borderRadius: 6,
    fontSize: 14,
    outline: "none",
    minWidth: 160,
  },
  btn: {
    padding: "8px 16px",
    background: "#1570ef",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  error: { color: "#c62828", marginBottom: 12 },
  muted: { color: "#667085" },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 16,
  },
  card: {
    background: "#fff",
    border: "1px solid #e4e7ec",
    borderRadius: 8,
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cardLabel: { fontSize: 13, color: "#667085", fontWeight: 500 },
  cardValue: { fontSize: 28, fontWeight: 700 },
  generatedAt: { fontSize: 12, color: "#98a2b3", marginTop: 8 },
};
