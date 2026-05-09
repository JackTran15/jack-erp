import type { FormExtras } from "./types";

export const UNIT_PRESETS = ["Cái", "Hộp", "Thùng", "Chai", "Kg", "Lốc", "Tờ", "Bộ"];
export const GROUP_SUGGESTIONS = ["Điện tử", "Văn phòng phẩm", "Thực phẩm", "Gia dụng", "Thời trang"];
export const BRAND_SUGGESTIONS = ["Samsung", "LG", "Sony", "Deli", "Stabilo", "3M"];

export const COMMISSION_METHOD_OPTIONS = [
  { value: "percent_revenue", label: "% Doanh thu" },
  { value: "percent_profit", label: "% Lợi nhuận" },
  { value: "fixed", label: "Số tiền cố định" },
];

export const COMMISSION_POSITION_OPTIONS = ["Phục vụ", "Thu ngân", "Bếp", "Quản lý"];

export const MAX_IMAGE_COUNT = 10;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp";

// Tabs for the inventory item create form
export const TABS = [
  { id: "basic", label: "Thông tin cơ bản" },
  { id: "additional", label: "Thông tin bổ sung" },
  { id: "warehouse", label: "Thông tin kho" },
  { id: "commission", label: "Hoa hồng" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export const DEFAULT_EXTRAS: FormExtras = {
  initialStock: "0",
  initialStockUnitPrice: "0",
  showOnPos: true,
  manageBarcodePerUnit: false,
  attrColor: "",
  attrSize: "",
  weightG: "",
  pkgLength: "",
  pkgWidth: "",
  pkgHeight: "",
  oddSize: "",
  composition: "",
  yearMade: "",
  isGoldSilver: false,
  longDescription: "",
  minStock: "0",
  maxStock: "0",
  commissions: [
    {
      id: "commission-default",
      position: "Phục vụ",
      method: "percent_revenue",
      amount: "0",
      discountLimit: "0",
    },
  ],
};
