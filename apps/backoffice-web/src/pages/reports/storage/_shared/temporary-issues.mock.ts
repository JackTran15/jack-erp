// Nguồn mock dùng chung cho báo cáo "Hàng hóa xuất kho tạm" — store view
// (TemporaryIssuesReportPage) và chain (inventory-report.api.ts) cùng import để
// đồng bộ dữ liệu. Backend chưa có endpoint cho báo cáo này.
export interface TempIssueRow {
  sku: string;
  name: string;
  unit: string;
  location: string;
  date: string;
  time: string;
  staff: string;
  outQty: number;
  returnQty: number;
  saleQty: number;
  remainingQty: number;
  status: string;
  invoice: string;
}

export const TEMPORARY_ISSUES_MOCK_ROWS: TempIssueRow[] = [
  { sku: "MY1231-DO-36", name: "Giày thể thao MY1231-DO-36", unit: "Đôi", location: "", date: "08/05/2026", time: "16:45:51", staff: "Phan Thanh Hà", outQty: 0, returnQty: 1, saleQty: 0, remainingQty: 1, status: "Trả hàng trưng bày", invoice: "" },
  { sku: "TOAN1232-D-40", name: "Giày nam TOAN1232-D-40", unit: "Đôi", location: "", date: "08/05/2026", time: "10:46:24", staff: "Phan Thanh Hà", outQty: 1, returnQty: 0, saleQty: 0, remainingQty: -1, status: "Xuất không bán", invoice: "" },
  { sku: "AKCV19837-D-41", name: "Giày nam AKCV19837-D-41", unit: "Đôi", location: "", date: "08/05/2026", time: "00:24:43", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010015" },
  { sku: "MY3007-D-35", name: "Dép nữ MY3007-D-35", unit: "Đôi", location: "", date: "08/05/2026", time: "00:24:43", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010015" },
  { sku: "MY63652-D-35", name: "Sandal nữ MY63652-D-35", unit: "Đôi", location: "", date: "08/05/2026", time: "00:16:51", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010014" },
  { sku: "MY3007-D-35", name: "Dép nữ MY3007-D-35", unit: "Đôi", location: "", date: "07/05/2026", time: "21:18:23", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010013" },
  { sku: "MY63652-D-36", name: "Sandal nữ MY63652-D-36", unit: "Đôi", location: "", date: "06/05/2026", time: "19:56:33", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010012" },
  { sku: "MY63652-D-37", name: "Sandal nữ MY63652-D-37", unit: "Đôi", location: "", date: "06/05/2026", time: "00:53:25", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 4, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010011" },
  { sku: "CTH64982-D-39", name: "Giày nam CTH64982-D-39", unit: "Đôi", location: "", date: "06/05/2026", time: "00:15:02", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 0, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010008" },
  { sku: "PGIA222-D-35", name: "Giày nữ PGIA222-D-35", unit: "Đôi", location: "", date: "05/05/2026", time: "23:59:08", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010007" },
  { sku: "DUG02030-N-39", name: "Dép nam DUG02030-N-39", unit: "Đôi", location: "", date: "05/05/2026", time: "17:09:50", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010006" },
  { sku: "MY63652-D-36", name: "Sandal nữ MY63652-D-36", unit: "Đôi", location: "", date: "05/05/2026", time: "17:09:25", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010005" },
  { sku: "AKCV19837-D-38", name: "Giày nam AKCV19837-D-38", unit: "Đôi", location: "", date: "05/05/2026", time: "17:09:10", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010002" },
  { sku: "MY63652-D-35", name: "Sandal nữ MY63652-D-35", unit: "Đôi", location: "", date: "05/05/2026", time: "17:08:34", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010004" },
  { sku: "CTH64982-N-38", name: "Giày nam CTH64982-N-38", unit: "Đôi", location: "", date: "05/05/2026", time: "17:08:24", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010003" },
  { sku: "SAN822-D-39", name: "Dép nam SAN822-D-39", unit: "Đôi", location: "", date: "05/05/2026", time: "17:05:32", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2604010001" },
  { sku: "CTH64982-N-41", name: "Giày nam CTH64982-N-41", unit: "Đôi", location: "", date: "05/05/2026", time: "17:04:23", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010001" },
];
