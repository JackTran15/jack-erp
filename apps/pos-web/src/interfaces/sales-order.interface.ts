/**
 * Trạng thái đơn hàng (`sales_orders.status`). Khai ở đây vì chỉ entity dòng
 * đơn + body tìm kiếm dùng; `DRAFT` không bao giờ lên lưới POS.
 */
export type SalesOrderStatus =
  | "DRAFT"
  | "SENT"
  | "PROCESSED"
  | "REJECTED"
  | "CANCELLED";

/** Trạng thái giao (`sales_orders.delivery_status`) — có từ lúc đơn được nhận xử lý. */
export type DeliveryStatus =
  | "AWAITING_PICKUP"
  | "IN_TRANSIT"
  | "AWAITING_COD"
  | "COMPLETED"
  | "FAILED"
  | "RETURNED";

/**
 * Tab của lưới "Đơn hàng" (`deliveryTab`): 6 trạng thái giao + `CANCELLED`
 * (đơn huỷ) + `PAID` / `UNPAID` dẫn xuất từ hoá đơn (A-06). Bỏ trống = "Tất cả".
 */
export type SalesOrderDeliveryTab =
  | DeliveryStatus
  | "CANCELLED"
  | "PAID"
  | "UNPAID";

/** Một kênh bán hàng active — `GET /mobile/sales-channels` (sidebar kênh). */
export interface SalesChannelRow {
  id: string;
  code: string;
  name: string;
}

/** Một đối tác giao hàng active — `GET /mobile/delivery-partners`. */
export interface DeliveryPartnerRow {
  id: string;
  code: string;
  name: string;
}

/**
 * Một dòng lưới "Đơn hàng Online" — `POST /v2/mobile/sales-orders/search`
 * với `view: "ONLINE"`. Cột "Thông tin giao hàng" do client ghép từ
 * `recipient*` + `ship*`.
 */
export interface SalesOrderRow {
  id: string;
  status: SalesOrderStatus;
  /** Nhãn "Thiếu hàng". */
  stockShort: boolean;
  /** Mã đơn hàng (OCM). */
  externalOrderId: string | null;
  /** Ngày đơn hàng (ISO). */
  createdAt: string;
  recipientName: string | null;
  recipientPhone: string | null;
  shipAddressLine: string | null;
  shipWardName: string | null;
  shipProvinceName: string | null;
  /** Tổng thanh toán. */
  amountDue: number;
  /** ĐT giao vận. */
  deliveryPartnerName: string | null;
  /** NV bán hàng. */
  salespersonName: string | null;
  invoiceId: string | null;
  /** Số hoá đơn. */
  invoiceCode: string | null;
  /** Ghi chú. */
  note: string | null;
}

/**
 * Một dòng lưới "Đơn hàng" — `POST /v2/mobile/sales-orders/search` với
 * `view: "DELIVERY"`: dòng ONLINE + 24 cột giao hàng (A-11/A-12) + những gì
 * client cần để thao tác trên dòng.
 */
export interface DeliveryOrderRow extends SalesOrderRow {
  deliveryStatus: DeliveryStatus;
  /** Trạng thái giao được phép chuyển tới; rỗng khi đơn đã huỷ. */
  allowedNextStatuses: DeliveryStatus[];
  /** Ngày GH (ISO) — lần đầu sang IN_TRANSIT. */
  deliveredAt: string | null;
  /** Ngày HĐ (ISO) — `invoices.issued_at`. */
  invoiceDate: string | null;
  /** NULL khi đơn chưa có hoá đơn. */
  invoiceIsDraft: boolean | null;
  /** Thu ngân — người nhận xử lý đơn (`approved_by`). */
  cashierName: string | null;
  /** Khách hàng. */
  customerName: string | null;
  /** Kênh bán hàng. */
  salesChannel: string;
  /** Loại đơn hàng — mọi dòng `sales_orders` là "Đặt hàng". */
  orderType: "ORDER";
  /** Mã vận đơn. */
  trackingCode: string | null;
  /** Thông tin gói hàng. */
  packageInfo: string | null;
  /** Phí GH thu khách. */
  shippingFeeCustomer: number;
  /** Đặt cọc. */
  deposit: number;
  /** Khách nợ. */
  customerDebt: number;
  /** Còn phải thu — cùng nguồn với `customerDebt` (A-12). */
  remainingReceivable: number;
  /** Thu hộ — cố định 0 đợt này (A-12). */
  cod: number;
  /** Phí GH trả ĐT — NULL = chưa biết, khác 0. */
  partnerShippingFee: number | null;
  debtId: string | null;
}

/** Kết quả của MỘT đơn trong batch — lỗi từng đơn nằm ở đây, không ném. */
export interface SalesOrderBatchResult {
  id: string;
  ok: boolean;
  /** Mã lỗi máy đọc (vd `NO_OPEN_SESSION`, `ORDER_NOT_PROCESSABLE`). */
  code?: string;
  /** Lý do hiển thị (tiếng Việt); vắng khi `ok`. */
  message?: string;
}
