import { useState } from "react";
import { useInventoryValuation } from "../../hooks/useReportData";
import { useQueryToast } from "../../hooks/useQueryToast";
import { AdminPageShell } from "../../components/layout/AdminPageShell";

export function InventoryReportPage() {
  const [branchId, setBranchId] = useState("");

  const {
    data = [],
    isLoading: loading,
    error,
    errorUpdatedAt,
    refetch,
  } = useInventoryValuation({
    branchId: branchId || undefined,
  });

  useQueryToast(error ? { variant: "error", error } : null, {
    toastId: "report-inventory-valuation",
    updatedAt: errorUpdatedAt,
  });

  const handleExportCsv = () => {
    if (data.length === 0) return;
    const headers = ["ID mặt hàng", "SKU", "Tên mặt hàng", "Chi nhánh", "SL tồn", "Giá vốn", "Giá trị"];
    const rows = data.map((r) => [r.itemId, r.sku, r.itemName, r.branchId ?? "", r.quantityOnHand, r.unitCost, r.totalValue]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-valuation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminPageShell>
      <div style={styles.header}>
        <h1 style={styles.title}>Định giá tồn kho</h1>
        <button style={styles.btnSecondary} onClick={handleExportCsv} disabled={data.length === 0}>
          Xuất CSV
        </button>
      </div>

      <div style={styles.filters}>
        <label style={styles.filterLabel}>
          ID chi nhánh
          <input style={styles.input} type="text" placeholder="Tất cả chi nhánh" value={branchId} onChange={(e) => setBranchId(e.target.value)} />
        </label>
        <button style={styles.btn} onClick={() => void refetch()}>Làm mới</button>
      </div>

      {loading && <p style={styles.muted}>Đang tải…</p>}

      {!loading && data.length === 0 && <p style={styles.muted}>Không có dữ liệu tồn kho.</p>}

      {data.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID mặt hàng</th>
                <th style={styles.th}>Chi nhánh</th>
                <th style={styles.thRight}>Tồn kho</th>
                <th style={styles.thRight}>Giá vốn</th>
                <th style={styles.thRight}>Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={`${row.itemId}-${idx}`} style={styles.tr}>
                  <td style={styles.td}>{row.itemId}</td>
                  <td style={styles.td}>{row.branchId ?? "—"}</td>
                  <td style={styles.tdRight}>{row.quantityOnHand}</td>
                  <td style={styles.tdRight}>{fmt(row.unitCost)}</td>
                  <td style={styles.tdRight}>{fmt(row.totalValue)}</td>
                </tr>
              ))}
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
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { margin: 0, fontSize: 24, fontWeight: 600 },
  filters: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 24 },
  filterLabel: { display: "flex", flexDirection: "column", fontSize: 12, fontWeight: 500, gap: 4, color: "#344054" },
  input: { padding: "8px 10px", border: "1px solid #d0d5dd", borderRadius: 6, fontSize: 14, outline: "none", minWidth: 160 },
  btn: { padding: "8px 16px", background: "#1570ef", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer" },
  btnSecondary: { padding: "8px 16px", background: "#fff", color: "#344054", border: "1px solid #d0d5dd", borderRadius: 6, fontSize: 14, cursor: "pointer" },
  muted: { color: "#667085" },
  tableWrap: { overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e4e7ec", background: "#f9fafb", fontWeight: 600, fontSize: 13 },
  thRight: { textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e4e7ec", background: "#f9fafb", fontWeight: 600, fontSize: 13 },
  tr: { borderBottom: "1px solid #f2f4f7" },
  td: { padding: "10px 12px" },
  tdRight: { padding: "10px 12px", textAlign: "right" },
};
