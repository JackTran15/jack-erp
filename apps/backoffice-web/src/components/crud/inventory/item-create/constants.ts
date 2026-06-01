import type { FormExtras } from "./types";

export const COMMISSION_METHOD_OPTIONS = [
  { value: "percent_revenue", label: "% Doanh thu" },
  { value: "percent_profit", label: "% Lợi nhuận" },
  { value: "fixed", label: "Số tiền cố định" },
];

export const COMMISSION_POSITION_OPTIONS = ["Phục vụ", "Thu ngân", "Bếp", "Quản lý"];

export const MAX_IMAGE_COUNT = 10;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp";

export enum Tab {
  BASIC = "basic",
  ADDITIONAL = "additional",
  WAREHOUSE = "warehouse",
  COMMISSION = "commission",
}

export const TABS = [
  { id: Tab.BASIC, label: "Thông tin cơ bản" },
  { id: Tab.ADDITIONAL, label: "Thông tin bổ sung" },
  { id: Tab.WAREHOUSE, label: "Thông tin kho" },
  { id: Tab.COMMISSION, label: "Hoa hồng" },
];

export enum SubTab {
  CONVERSION = "conversion",
  PROVIDERS = "providers",
}

export const SUB_TABS = [
  { id: SubTab.CONVERSION, label: "Đơn vị chuyển đổi" },
  { id: SubTab.PROVIDERS, label: "Nhà cung cấp" },
];

export const DEFAULT_EXTRAS: FormExtras = {
  initialStock: "0",
  initialStockUnitPrice: "0",
  showOnPos: true,
  manageBarcodePerUnit: false,
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
