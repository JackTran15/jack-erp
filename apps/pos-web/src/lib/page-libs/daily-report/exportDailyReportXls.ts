/**
 * Trigger a browser download for a Blob (the server-generated "BÁO CÁO TỔNG
 * HỢP" .xlsx from `POST /reports/pos/daily-summary/export`).
 */
export function exportDailyReportXls(
  blob: Blob,
  filename = "Bao-cao-tong-hop.xlsx",
): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
