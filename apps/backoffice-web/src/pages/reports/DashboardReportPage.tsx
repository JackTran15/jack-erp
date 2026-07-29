import { useState } from "react";
import { useDashboard } from "../../hooks/useReportData";
import { useQueryToast } from "../../hooks/useQueryToast";
import { AdminPageShell } from "../../components/layout/AdminPageShell";

export function DashboardReportPage() {
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const {
    data,
    isLoading: loading,
    error,
    errorUpdatedAt,
    refetch,
  } = useDashboard({
    branchId: branchId || undefined,
    startDate,
    endDate,
  });

  useQueryToast(error ? { variant: "error", error } : null, {
    toastId: "report-dashboard",
    updatedAt: errorUpdatedAt,
  });

  return (
    <AdminPageShell>
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

      {loading && <p style={styles.muted}>Đang tải…</p>}

      {data && (
        <div style={styles.cardGrid}>
          <SummaryCard label="Tổng bán hôm nay" value={fmt(data.totalSalesToday)} color="rgb(var(--primary-blue))" />
          <SummaryCard label="Tổng trả hàng hôm nay" value={fmt(data.totalReturnsToday)} color="hsl(var(--destructive))" />
          <SummaryCard label="Doanh thu ròng" value={fmt(data.netRevenue)} color="hsl(var(--success))" />
          <SummaryCard label="Phiên POS đang mở" value={String(data.openPosSessionCount)} color="hsl(var(--primary))" />
          <SummaryCard label="Mặt hàng sắp hết" value={String(data.lowStockItemCount)} color="hsl(var(--warning))" />
          <SummaryCard label="Công nợ phải thu" value={fmt(data.pendingReceivables)} color="rgb(var(--primary-blue))" />
          <SummaryCard label="Công nợ phải trả" value={fmt(data.pendingPayables)} color="hsl(var(--destructive))" />
        </div>
      )}

      {data && (
        <p style={styles.generatedAt}>
          Tạo lúc: {new Date(data.generatedAt).toLocaleString("vi-VN")}
          {data.branchId ? ` | Chi nhánh: ${data.branchId}` : " | Gộp toàn hệ thống"}
        </p>
      )}
    </AdminPageShell>
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
    color: "hsl(var(--foreground))",
  },
  input: {
    padding: "8px 10px",
    border: "1px solid hsl(var(--input))",
    borderRadius: 6,
    fontSize: 14,
    outline: "none",
    minWidth: 160,
  },
  btn: {
    padding: "8px 16px",
    background: "rgb(var(--primary-blue))",
    color: "hsl(var(--primary-blue-foreground))",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  muted: { color: "hsl(var(--muted-foreground))" },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 16,
  },
  card: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  cardLabel: { fontSize: 13, color: "hsl(var(--muted-foreground))", fontWeight: 500 },
  cardValue: { fontSize: 28, fontWeight: 700 },
  generatedAt: { fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 8 },
};
