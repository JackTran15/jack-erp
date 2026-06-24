import type { ReportFilterOption } from "@erp/shared-interfaces";

// Options filter báo cáo kho — mock (chain mode chưa có backend, xem CLAUDE.local.md).

export const warehouseOptions: ReportFilterOption[] = [
  { value: "wh_cantho", label: "SHOWROOM CẦN THƠ" },
  { value: "wh_danang", label: "SHOWROOM ĐÀ NẴNG" },
];

export const productGroupOptions: ReportFilterOption[] = [
  { value: "giay_nam", label: "Giày nam" },
  { value: "giay_nu", label: "Giày nữ" },
  { value: "sandal_nu", label: "Sandal nữ" },
  { value: "dep_nu", label: "Dép nữ" },
  { value: "dep_nam", label: "Dép nam" },
];

// "Loại hàng hóa" — phân loại mặt hàng (single select).
export const productTypeOptions: ReportFilterOption[] = [
  { value: "product", label: "Hàng hóa" },
  { value: "service", label: "Dịch vụ" },
  { value: "combo", label: "Combo - đóng gói" },
];

// "Thống kê theo" — giá trị cố định (mirror backend ItemGroupBy: item/parent/group).
export const statisticByOptions: ReportFilterOption[] = [
  { value: "item", label: "Hàng hóa" },
  { value: "parent", label: "Mẫu mã" },
  { value: "group", label: "Nhóm hàng hóa" },
];

export const unitOptions: ReportFilterOption[] = [
  { value: "doi", label: "Đôi" },
  { value: "cai", label: "Cái" },
];

export const brandOptions: ReportFilterOption[] = [
  { value: "giay_mt", label: "Giày MT" },
  { value: "lasta", label: "Lasta" },
  { value: "giay_viet", label: "Giày Việt" },
];

export const workShiftOptions: ReportFilterOption[] = [
  { value: "morning", label: "Ca sáng" },
  { value: "afternoon", label: "Ca chiều" },
];

// Cửa hàng nhận điều chuyển — mock chi nhánh.
export const receivingStoreOptions: ReportFilterOption[] = [
  { value: "store_ct", label: "Chi nhánh Mậu Thân - CT" },
  { value: "store_dn", label: "Chi nhánh Đà Nẵng - DN" },
];
