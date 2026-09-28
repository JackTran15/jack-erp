/**
 * Mock "Tình hình phát hành HĐĐT" (row 1, chế độ chuỗi). Backend chưa có HĐĐT —
 * thay bằng fetcher thật trong `_api/overview.api.ts` khi có endpoint.
 */
import type { EInvoiceStatusData } from "../_api/overview.interface";
import type { OverviewPeriod } from "../_lib/period";

const BRANCHES: EInvoiceStatusData["branches"] = [
  { branchId: "mock-da-nang", branchName: "Chi nhánh 211 TP. Đà Nẵng", unissued: 8, failed: 0, issued: 0 },
  { branchId: "mock-ca-mau", branchName: "Chi nhánh TP. Cà Mau", unissued: 1, failed: 0, issued: 0 },
  { branchId: "mock-buon-ma-thuot", branchName: "Giày MT Buôn Ma Thuột", unissued: 1, failed: 0, issued: 0 },
];

/** Số liệu mock không đổi theo kỳ; `period` giữ chữ ký giống fetcher thật. */
export async function fetchEInvoiceStatusMock(
  _period: OverviewPeriod,
): Promise<EInvoiceStatusData> {
  return { updatedAt: new Date().toISOString(), branches: BRANCHES };
}
