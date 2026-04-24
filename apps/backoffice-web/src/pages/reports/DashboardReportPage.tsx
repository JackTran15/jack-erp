import { useState, useEffect, useCallback } from "react";
import { http } from "../../lib/http";
import type { DashboardSummary } from "@erp/shared-interfaces";

export function DashboardReportPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const qs = params.toString();
      const result = await http.get<DashboardSummary>(
        `/reports/dashboard${qs ? `?${qs}` : ""}`,
      );
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [branchId, startDate, endDate]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Dashboard</h1>

      <div style={styles.filters}>
        <label style={styles.filterLabel}>
          Branch ID
          <input
            style={styles.input}
            type="text"
            placeholder="Leave empty for consolidated"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          />
        </label>
        <label style={styles.filterLabel}>
          Start Date
          <input
            style={styles.input}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label style={styles.filterLabel}>
          End Date
          <input
            style={styles.input}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <button style={styles.btn} onClick={fetchDashboard}>
          Refresh
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {loading && <p style={styles.muted}>Loading…</p>}

      {data && (
        <div style={styles.cardGrid}>
          <SummaryCard label="Total Sales" value={fmt(data.totalSalesToday)} color="#1570ef" />
          <SummaryCard label="Total Returns" value={fmt(data.totalReturnsToday)} color="#d32f2f" />
          <SummaryCard label="Net Revenue" value={fmt(data.netRevenue)} color="#2e7d32" />
          <SummaryCard label="Open POS Sessions" value={String(data.openPosSessionCount)} color="#6941c6" />
          <SummaryCard label="Low Stock Items" value={String(data.lowStockItemCount)} color="#dc6803" />
          <SummaryCard label="Pending AR" value={fmt(data.pendingReceivables)} color="#1570ef" />
          <SummaryCard label="Pending AP" value={fmt(data.pendingPayables)} color="#c4320a" />
        </div>
      )}

      {data && (
        <p style={styles.generatedAt}>
          Generated at: {new Date(data.generatedAt).toLocaleString()}
          {data.branchId ? ` | Branch: ${data.branchId}` : " | Consolidated"}
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
  return new Intl.NumberFormat("en-US", {
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
