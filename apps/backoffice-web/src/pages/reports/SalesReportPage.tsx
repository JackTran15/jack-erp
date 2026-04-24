import { useState, useEffect, useCallback } from "react";
import { http } from "../../lib/http";
import type { SalesSummary } from "@erp/shared-interfaces";

export function SalesReportPage() {
  const [data, setData] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const qs = params.toString();
      const result = await http.get<SalesSummary>(
        `/reports/sales-summary${qs ? `?${qs}` : ""}`,
      );
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [branchId, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Sales Summary</h1>

      <div style={styles.filters}>
        <label style={styles.filterLabel}>
          Branch ID
          <input style={styles.input} type="text" placeholder="All branches" value={branchId} onChange={(e) => setBranchId(e.target.value)} />
        </label>
        <label style={styles.filterLabel}>
          Start Date
          <input style={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label style={styles.filterLabel}>
          End Date
          <input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button style={styles.btn} onClick={fetchData}>Refresh</button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {loading && <p style={styles.muted}>Loading…</p>}

      {data && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Metric</th>
                <th style={styles.th}>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr style={styles.tr}>
                <td style={styles.td}>Period</td>
                <td style={styles.td}>
                  {new Date(data.periodStart).toLocaleDateString()} – {new Date(data.periodEnd).toLocaleDateString()}
                </td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Total Sales</td>
                <td style={styles.td}>{fmt(data.totalSales)}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Sale Count</td>
                <td style={styles.td}>{data.saleCount}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Total Returns</td>
                <td style={styles.td}>{fmt(data.totalReturns)}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Return Count</td>
                <td style={styles.td}>{data.returnCount}</td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Net Revenue</td>
                <td style={{ ...styles.td, fontWeight: 700, color: "#2e7d32" }}>
                  {fmt(data.netRevenue)}
                </td>
              </tr>
              <tr style={styles.tr}>
                <td style={styles.td}>Average Sale Value</td>
                <td style={styles.td}>{fmt(data.averageSaleValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200, margin: "0 auto", padding: "24px 16px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  title: { margin: "0 0 20px", fontSize: 24, fontWeight: 600 },
  filters: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 24 },
  filterLabel: { display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 500, gap: 4, color: "#344054" },
  input: { padding: "8px 10px", border: "1px solid #d0d5dd", borderRadius: 6, fontSize: 14, outline: "none", minWidth: 160 },
  btn: { padding: "8px 16px", background: "#1570ef", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer" },
  error: { color: "#c62828", marginBottom: 12 },
  muted: { color: "#667085" },
  tableWrap: { overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e4e7ec", background: "#f9fafb", fontWeight: 600, fontSize: 13 },
  tr: { borderBottom: "1px solid #f2f4f7" },
  td: { padding: "10px 12px" },
};
