import type {
  DeliveryStatus,
  SalesOrderDeliveryTab,
} from "@erp/pos/interfaces/sales-order.interface";

/** Lưới "Đơn hàng" luôn lấy 100 dòng/trang — cũng là trần `limit` của server. */
export const ORDER_LIST_PAGE_SIZE = 100;

/** Tooltip cho các nút ngoài phạm vi đợt này (AC-17). */
export const ORDER_UNSUPPORTED_TOOLTIP = "Chưa hỗ trợ";

// ─── Tab ─────────────────────────────────────────────────────────────────────

/** "" = "Tất cả"; còn lại gửi nguyên làm `deliveryTab`. */
export type OrderTab = "" | SalesOrderDeliveryTab;

export interface OrderTabOption {
  value: OrderTab;
  label: string;
}

/** 10 tab dạng pill, đúng thứ tự ảnh tham chiếu. */
export const ORDER_TABS: OrderTabOption[] = [
  { value: "", label: "Tất cả" },
  { value: "AWAITING_PICKUP", label: "Chờ giao/lấy hàng" },
  { value: "IN_TRANSIT", label: "Đang giao hàng" },
  { value: "AWAITING_COD", label: "Chờ thu COD" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "FAILED", label: "Thất bại" },
  { value: "RETURNED", label: "Đã chuyển hoàn" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "PAID", label: "Đã thanh toán" },
  { value: "UNPAID", label: "Chưa thanh toán/Lưu tạm" },
];

// ─── Trạng thái giao ────────────────────────────────────────────────────────

/** Nhãn + màu badge cột "Trạng thái". */
export const DELIVERY_STATUS_BADGE: Record<
  DeliveryStatus,
  { label: string; className: string }
> = {
  AWAITING_PICKUP: {
    label: "Chờ giao/lấy hàng",
    className: "bg-amber-50 text-amber-700",
  },
  IN_TRANSIT: { label: "Đang giao hàng", className: "bg-sky-50 text-sky-700" },
  AWAITING_COD: {
    label: "Chờ thu COD",
    className: "bg-violet-50 text-violet-700",
  },
  COMPLETED: {
    label: "Hoàn thành",
    className: "bg-emerald-50 text-emerald-700",
  },
  FAILED: { label: "Thất bại", className: "bg-red-50 text-red-700" },
  RETURNED: {
    label: "Đã chuyển hoàn",
    className: "bg-orange-50 text-orange-700",
  },
};

/** Đơn huỷ không qua chuyển hoàn — hiện "Đã hủy" thay cho trạng thái giao. */
export const ORDER_CANCELLED_BADGE = {
  label: "Đã hủy",
  className: "bg-gray-100 text-gray-600",
};

export interface DeliveryStatusFilterOption {
  value: "" | DeliveryStatus;
  label: string;
}

/** Ô lọc cột "Trạng thái" → `columnFilters.deliveryStatus`. */
export const DELIVERY_STATUS_FILTER_OPTIONS: DeliveryStatusFilterOption[] = [
  { value: "", label: "Tất cả" },
  ...(Object.keys(DELIVERY_STATUS_BADGE) as DeliveryStatus[]).map((value) => ({
    value,
    label: DELIVERY_STATUS_BADGE[value].label,
  })),
];

// ─── Loại ngày / nhãn / loại đơn ─────────────────────────────────────────────

export type OrderDateField = "CREATED" | "DELIVERED" | "INVOICED";

export interface OrderDateFieldOption {
  value: OrderDateField;
  label: string;
}

/** Loại ngày mà khoảng ngày áp vào (A-16). */
export const ORDER_DATE_FIELD_OPTIONS: OrderDateFieldOption[] = [
  { value: "CREATED", label: "Ngày tạo" },
  { value: "DELIVERED", label: "Ngày GH" },
  { value: "INVOICED", label: "Ngày HĐ" },
];

/** Nhãn "Thiếu hàng" (A-10) — nhãn duy nhất hiện có, lọc theo `stockShort`. */
export const ORDER_STOCK_SHORT_LABEL = "STOCK_SHORT";

export interface OrderLabelOption {
  value: "" | typeof ORDER_STOCK_SHORT_LABEL;
  label: string;
}

export const ORDER_LABEL_OPTIONS: OrderLabelOption[] = [
  { value: "", label: "Tất cả" },
  { value: ORDER_STOCK_SHORT_LABEL, label: "Thiếu hàng" },
];

/** Loại đơn hàng — mọi đơn trong `sales_orders` là "Đặt hàng" (A-12). */
export const ORDER_TYPE_LABEL: Record<"ORDER", string> = {
  ORDER: "Đặt hàng",
};

export interface OrderTypeOption {
  value: "" | "ORDER";
  label: string;
}

export const ORDER_TYPE_OPTIONS: OrderTypeOption[] = [
  { value: "", label: "Tất cả" },
  { value: "ORDER", label: ORDER_TYPE_LABEL.ORDER },
];

// ─── Cột ─────────────────────────────────────────────────────────────────────

/** 24 cột của lưới "Đơn hàng" (A-11/A-12). */
export enum OrderColumnKey {
  CreatedAt = "createdAt",
  DeliveredAt = "deliveredAt",
  InvoiceDate = "invoiceDate",
  InvoiceCode = "invoiceCode",
  CashierName = "cashierName",
  SalespersonName = "salespersonName",
  CustomerName = "customerName",
  Recipient = "recipient",
  ShippingFeeCustomer = "shippingFeeCustomer",
  DeliveryPartnerName = "deliveryPartnerName",
  TrackingCode = "trackingCode",
  ExternalOrderId = "externalOrderId",
  AmountDue = "amountDue",
  Deposit = "deposit",
  CustomerDebt = "customerDebt",
  RemainingReceivable = "remainingReceivable",
  Cod = "cod",
  PackageInfo = "packageInfo",
  PartnerShippingFee = "partnerShippingFee",
  SalesChannel = "salesChannel",
  OrderType = "orderType",
  Label = "label",
  Note = "note",
  Status = "status",
}

export const ORDER_COLUMN_LABELS: Record<OrderColumnKey, string> = {
  [OrderColumnKey.CreatedAt]: "Ngày tạo đơn",
  [OrderColumnKey.DeliveredAt]: "Ngày GH",
  [OrderColumnKey.InvoiceDate]: "Ngày HĐ",
  [OrderColumnKey.InvoiceCode]: "Số hóa đơn",
  [OrderColumnKey.CashierName]: "Thu ngân",
  [OrderColumnKey.SalespersonName]: "NV bán hàng",
  [OrderColumnKey.CustomerName]: "Khách hàng",
  [OrderColumnKey.Recipient]: "Người nhận",
  [OrderColumnKey.ShippingFeeCustomer]: "Phí GH thu khách",
  [OrderColumnKey.DeliveryPartnerName]: "ĐT giao hàng",
  [OrderColumnKey.TrackingCode]: "Mã vận đơn",
  [OrderColumnKey.ExternalOrderId]: "Mã đơn hàng",
  [OrderColumnKey.AmountDue]: "Tổng thanh toán",
  [OrderColumnKey.Deposit]: "Đặt cọc",
  [OrderColumnKey.CustomerDebt]: "Khách nợ",
  [OrderColumnKey.RemainingReceivable]: "Còn phải thu",
  [OrderColumnKey.Cod]: "Thu hộ",
  [OrderColumnKey.PackageInfo]: "Thông tin gói hàng",
  [OrderColumnKey.PartnerShippingFee]: "Phí GH trả ĐT",
  [OrderColumnKey.SalesChannel]: "Kênh bán hàng",
  [OrderColumnKey.OrderType]: "Loại đơn hàng",
  [OrderColumnKey.Label]: "Nhãn",
  [OrderColumnKey.Note]: "Ghi chú",
  [OrderColumnKey.Status]: "Trạng thái",
};

/** Thứ tự cột hiển thị — đúng ảnh tham chiếu. */
export const ORDER_COLUMN_ORDER: OrderColumnKey[] = [
  OrderColumnKey.CreatedAt,
  OrderColumnKey.DeliveredAt,
  OrderColumnKey.InvoiceDate,
  OrderColumnKey.InvoiceCode,
  OrderColumnKey.CashierName,
  OrderColumnKey.SalespersonName,
  OrderColumnKey.CustomerName,
  OrderColumnKey.Recipient,
  OrderColumnKey.ShippingFeeCustomer,
  OrderColumnKey.DeliveryPartnerName,
  OrderColumnKey.TrackingCode,
  OrderColumnKey.ExternalOrderId,
  OrderColumnKey.AmountDue,
  OrderColumnKey.Deposit,
  OrderColumnKey.CustomerDebt,
  OrderColumnKey.RemainingReceivable,
  OrderColumnKey.Cod,
  OrderColumnKey.PackageInfo,
  OrderColumnKey.PartnerShippingFee,
  OrderColumnKey.SalesChannel,
  OrderColumnKey.OrderType,
  OrderColumnKey.Label,
  OrderColumnKey.Note,
  OrderColumnKey.Status,
];

// ─── Ô lọc cột ──────────────────────────────────────────────────────────────

/** Ô lọc ngày (`dd/mm/yyyy`) → `DateRangeFilter`. */
export const ORDER_DATE_FILTER_KEYS = [
  "orderDate",
  "deliveredAt",
  "invoiceDate",
] as const;

/** Ô lọc chữ → `StringFilter`. "Người nhận" lọc qua `deliveryInfo` (tên/SĐT/địa chỉ). */
export const ORDER_TEXT_FILTER_KEYS = [
  "invoiceCode",
  "salespersonName",
  "customerName",
  "deliveryInfo",
  "deliveryPartnerName",
  "trackingCode",
  "externalOrderId",
  "packageInfo",
  "salesChannel",
  "note",
] as const;

/** Ô lọc số tiền → `CompareFilter`. */
export const ORDER_NUMBER_FILTER_KEYS = [
  "shippingFeeCustomer",
  "amountDue",
  "deposit",
  "remainingReceivable",
  "partnerShippingFee",
] as const;

/**
 * Giá trị ô lọc theo cột. Ba ô cuối là select: `orderType` chỉ hiển thị (mọi
 * đơn là "Đặt hàng"), `label` = `ORDER_STOCK_SHORT_LABEL` → `stockShort`,
 * `deliveryStatus` → `columnFilters.deliveryStatus`.
 */
export const EMPTY_ORDER_FILTERS = {
  orderDate: "",
  deliveredAt: "",
  invoiceDate: "",
  invoiceCode: "",
  salespersonName: "",
  customerName: "",
  deliveryInfo: "",
  deliveryPartnerName: "",
  trackingCode: "",
  externalOrderId: "",
  packageInfo: "",
  salesChannel: "",
  note: "",
  shippingFeeCustomer: "",
  amountDue: "",
  deposit: "",
  remainingReceivable: "",
  partnerShippingFee: "",
  orderType: "",
  label: "",
  deliveryStatus: "",
} as const;

// ─── Thao tác giao hàng (UOW-05) ─────────────────────────────────────────────

/**
 * Quyền backend chặn ở `deliver` / `delivery-status`. Thiếu thì ẩn Giao hàng,
 * Hoàn thành, Cập nhật TT (AC-26) — backend mới là chỗ chặn thật.
 */
export const SALES_ORDER_DELIVER_PERMISSION = "pos.sales-order.deliver";

/** Trạng thái giao cho phép bấm "Giao hàng" (AWAITING_PICKUP / FAILED → IN_TRANSIT). */
export const DELIVERABLE_STATUSES: ReadonlyArray<DeliveryStatus> = [
  "AWAITING_PICKUP",
  "FAILED",
];

/** Giới hạn độ dài — khớp `@MaxLength` của DTO server. */
export const DELIVER_TRACKING_CODE_MAX_LENGTH = 100;
export const DELIVER_PACKAGE_INFO_MAX_LENGTH = 500;
export const DELIVERY_STATUS_REASON_MAX_LENGTH = 500;

/** Gợi ý khi tổ chức chưa có đối tác giao hàng active. */
export const DELIVERY_PARTNER_EMPTY_HINT =
  "Chưa có đối tác — thêm ở Backoffice › Danh mục › Đối tác giao hàng";

/** Cảnh báo khi chọn "Đã chuyển hoàn" (AC-21). */
export const DELIVERY_RETURNED_WARNING =
  "Huỷ hoá đơn và hoàn tồn — không thể hoàn tác";

/**
 * Mã lỗi (từng đơn trong `results[i].code`, hoặc cả request) của Giao hàng /
 * Cập nhật TT / Hoàn thành → câu tiếng Việt. Mã không có ở đây — gồm
 * `DEBT_OUTSTANDING` ("Đơn còn … chưa thu", có số tiền) và lỗi của
 * `CancelInvoiceService` như `INVOICE_NOT_CANCELLABLE` — dùng nguyên `message` server.
 */
export const DELIVERY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVOICE_NOT_FINALIZED:
    "Hoá đơn chưa hoàn tất — mở hoá đơn để thanh toán trước",
  INVALID_DELIVERY_TRANSITION: "Không thể chuyển trạng thái",
  DELIVERY_PARTNER_INACTIVE: "Đối tác giao hàng không hợp lệ",
  ORDER_NOT_HELD_BY_BRANCH: "Đơn không thuộc chi nhánh",
};
