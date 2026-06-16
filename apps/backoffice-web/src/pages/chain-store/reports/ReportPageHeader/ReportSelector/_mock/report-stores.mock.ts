export interface ReportStore {
  id: string;
  code: string;
  name: string;
}

// Mock danh sách cửa hàng cho dòng filter "Theo nhóm cửa hàng".
// Chain mode hiện chưa có backend support nên dùng mock (xem CLAUDE.local.md).
export const reportStores: ReportStore[] = [
  { id: "khotong", code: "KHOTONG", name: "Kho tổng" },
  { id: "bho", code: "BHo", name: "Chi nhánh TP. Biên Hòa" },
  { id: "bm", code: "BM", name: "Giày MT Buôn Ma Thuột" },
  { id: "btr", code: "BTr", name: "Chi nhánh TP. Bến Tre" },
  { id: "cm", code: "CM", name: "Chi nhánh TP. Cà Mau" },
  { id: "ct", code: "CT", name: "Chi nhánh Nguyễn Trãi - CT" },
  { id: "dn", code: "DN", name: "Chi nhánh 211 TP. Đà Nẵng" },
  { id: "hu", code: "HU", name: "Chi nhánh TP. Huế" },
];
