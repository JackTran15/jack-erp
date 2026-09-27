import type { SalesOrderStatus } from "@erp/pos/interfaces/sales-order.interface";

/** Server giới hạn `limit` tối đa 100 — mặc định lấy luôn mức trần. */
export const ONLINE_ORDER_LIST_DEFAULT_PAGE_SIZE = 100;

/** Khóa các cột của lưới "Đơn hàng Online" (10 cột, A-11). */
export enum OnlineOrderColumnKey {
  ExternalOrderId = "externalOrderId",
  OrderDate = "orderDate",
  DeliveryInfo = "deliveryInfo",
  AmountDue = "amountDue",
  Status = "status",
  DeliveryPartnerName = "deliveryPartnerName",
  SalespersonName = "salespersonName",
  InvoiceCode = "invoiceCode",
  Note = "note",
  Label = "label",
}

export const ONLINE_ORDER_COLUMN_LABELS: Record<OnlineOrderColumnKey, string> = {
  [OnlineOrderColumnKey.ExternalOrderId]: "Mã đơn hàng (OCM)",
  [OnlineOrderColumnKey.OrderDate]: "Ngày đơn hàng",
  [OnlineOrderColumnKey.DeliveryInfo]: "Thông tin giao hàng",
  [OnlineOrderColumnKey.AmountDue]: "Tổng thanh toán",
  [OnlineOrderColumnKey.Status]: "Trạng thái",
  [OnlineOrderColumnKey.DeliveryPartnerName]: "ĐT giao vận",
  [OnlineOrderColumnKey.SalespersonName]: "NV bán hàng",
  [OnlineOrderColumnKey.InvoiceCode]: "Số hoá đơn",
  [OnlineOrderColumnKey.Note]: "Ghi chú",
  [OnlineOrderColumnKey.Label]: "Nhãn",
};

/** Thứ tự cột hiển thị. */
export const ONLINE_ORDER_COLUMN_ORDER: OnlineOrderColumnKey[] = [
  OnlineOrderColumnKey.ExternalOrderId,
  OnlineOrderColumnKey.OrderDate,
  OnlineOrderColumnKey.DeliveryInfo,
  OnlineOrderColumnKey.AmountDue,
  OnlineOrderColumnKey.Status,
  OnlineOrderColumnKey.DeliveryPartnerName,
  OnlineOrderColumnKey.SalespersonName,
  OnlineOrderColumnKey.InvoiceCode,
  OnlineOrderColumnKey.Note,
  OnlineOrderColumnKey.Label,
];

/** Ô lọc theo cột; `label` = "" (Tất cả) hoặc "STOCK_SHORT" (Thiếu hàng). */
export const EMPTY_ONLINE_ORDER_FILTERS = {
  externalOrderId: "",
  orderDate: "",
  deliveryInfo: "",
  amountDue: "",
  deliveryPartnerName: "",
  salespersonName: "",
  invoiceCode: "",
  note: "",
  label: "",
} as const;

/** "" = Tất cả; còn lại là một `SalesOrderStatus` (A-13). DRAFT không bao giờ có. */
export type OnlineOrderStatusFilter = "" | Exclude<SalesOrderStatus, "DRAFT">;

export interface OnlineOrderStatusOption {
  value: OnlineOrderStatusFilter;
  label: string;
}

/** Bộ lọc trạng thái (A-13). */
export const ONLINE_ORDER_STATUS_OPTIONS: OnlineOrderStatusOption[] = [
  { value: "", label: "Tất cả" },
  { value: "SENT", label: "Chưa xử lý" },
  { value: "PROCESSED", label: "Đã xử lý" },
  { value: "REJECTED", label: "Từ chối" },
  { value: "CANCELLED", label: "Đã huỷ" },
];

/** Mặc định mở trang ở "Chưa xử lý". */
export const ONLINE_ORDER_DEFAULT_STATUS: OnlineOrderStatusFilter = "SENT";

/** Nhãn + màu badge cho cột Trạng thái. */
export const ONLINE_ORDER_STATUS_BADGE: Record<
  Exclude<SalesOrderStatus, "DRAFT">,
  { label: string; className: string }
> = {
  SENT: { label: "Chưa xử lý", className: "bg-amber-50 text-amber-700" },
  PROCESSED: { label: "Đã xử lý", className: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Từ chối", className: "bg-red-50 text-red-700" },
  CANCELLED: { label: "Đã huỷ", className: "bg-gray-100 text-gray-600" },
};

/** Nhãn "Thiếu hàng" (A-10) — giá trị của ô lọc cột Nhãn. */
export const ONLINE_ORDER_STOCK_SHORT_LABEL = "STOCK_SHORT";

export interface OnlineOrderLabelOption {
  value: "" | typeof ONLINE_ORDER_STOCK_SHORT_LABEL;
  label: string;
}

export const ONLINE_ORDER_LABEL_OPTIONS: OnlineOrderLabelOption[] = [
  { value: "", label: "Tất cả" },
  { value: ONLINE_ORDER_STOCK_SHORT_LABEL, label: "Thiếu hàng" },
];
