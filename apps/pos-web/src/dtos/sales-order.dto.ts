import type {
  CompareFilter,
  DateRangeFilter,
  EnumFilter,
  StringFilter,
} from "@erp/pos/dtos/invoice.dto";
import type {
  DeliveryStatus,
  SalesOrderBatchResult,
  SalesOrderDeliveryTab,
  SalesOrderRow,
  SalesOrderStatus,
} from "@erp/pos/interfaces/sales-order.interface";

/**
 * Bộ lọc theo cột của lưới "Đơn hàng Online" / "Đơn hàng" — cùng dạng operator
 * với lưới hoá đơn. Nhóm cuối chỉ có tác dụng với `view: "DELIVERY"`.
 */
export interface SalesOrderColumnFilters {
  externalOrderId?: StringFilter;
  orderDate?: DateRangeFilter;
  /** Khớp OR trên tên/SĐT người nhận, địa chỉ, phường, tỉnh. */
  deliveryInfo?: StringFilter;
  amountDue?: CompareFilter;
  status?: EnumFilter;
  deliveryPartnerName?: StringFilter;
  salespersonName?: StringFilter;
  invoiceCode?: StringFilter;
  note?: StringFilter;

  // ── Chỉ view DELIVERY ──
  /** Ngày GH. */
  deliveredAt?: DateRangeFilter;
  /** Ngày HĐ. */
  invoiceDate?: DateRangeFilter;
  customerName?: StringFilter;
  /** Mã vận đơn. */
  trackingCode?: StringFilter;
  /** Thông tin gói hàng. */
  packageInfo?: StringFilter;
  /** Kênh bán hàng. */
  salesChannel?: StringFilter;
  deliveryStatus?: EnumFilter;
  /** Phí GH thu khách. */
  shippingFeeCustomer?: CompareFilter;
  /** Đặt cọc. */
  deposit?: CompareFilter;
  /** Khách nợ / Còn phải thu. */
  remainingReceivable?: CompareFilter;
  /** Phí GH trả ĐT — đơn chưa có phí (NULL) không bao giờ khớp. */
  partnerShippingFee?: CompareFilter;
}

/**
 * Body cho `POST /v2/mobile/sales-orders/search`. Không có `branchId`: server
 * lấy chi nhánh từ `X-Branch-Id`.
 */
export interface SearchSalesOrdersBody {
  view: "ONLINE" | "DELIVERY";
  /** `sales_channels.id` — bắt buộc với `view: "ONLINE"`. */
  channelId?: string;
  /** Tab trạng thái; bỏ trống = "Tất cả". */
  status?: SalesOrderStatus;
  /** Tab của lưới "Đơn hàng" (view DELIVERY); bỏ trống = "Tất cả". */
  deliveryTab?: SalesOrderDeliveryTab;
  /** Mốc thời gian mà `from`/`to` áp vào; mặc định `CREATED`. */
  dateField?: "CREATED" | "DELIVERED" | "INVOICED";
  /** `YYYY-MM-DD` = một ngày theo giờ VN; timestamp đầy đủ = thời điểm chính xác. */
  from?: string;
  to?: string;
  /** Nhãn "Thiếu hàng"; bỏ trống = không lọc. */
  stockShort?: boolean;
  columnFilters?: SalesOrderColumnFilters;
  page?: number;
  /** Tối đa 100. */
  limit?: number;
}

/** Với `view: "DELIVERY"`, mỗi phần tử của `data` là `DeliveryOrderRow`. */
export interface SearchSalesOrdersResponse {
  data: SalesOrderRow[];
  total: number;
  page: number;
  limit: number;
}

/** Body cho các action batch trên `/mobile/sales-orders` (vd `POST process`) — tối đa 100 id. */
export interface ProcessSalesOrdersBody {
  ids: string[];
}

/** HTTP 200 kể cả khi có đơn lỗi — lý do nằm ở `results[i]`. */
export interface ProcessSalesOrdersResponse {
  results: SalesOrderBatchResult[];
}

/**
 * Body cho `POST /mobile/sales-orders/deliver` — MỘT bộ thông tin giao áp cho
 * mọi đơn tick. Trường bỏ trống thì KHÔNG gửi: server lưu NULL (không phải 0).
 */
export interface DeliverSalesOrdersBody {
  ids: string[];
  deliveryPartnerId?: string;
  /** Mã vận đơn, tối đa 100 ký tự. */
  trackingCode?: string;
  /** Phí GH trả ĐT, ≥ 0. */
  partnerShippingFee?: number;
  /** Thông tin gói hàng, tối đa 500 ký tự. */
  packageInfo?: string;
}

/** Body cho `POST /mobile/sales-orders/delivery-status` — "Cập nhật TT" và "Hoàn thành". */
export interface UpdateDeliveryStatusBody {
  ids: string[];
  to: DeliveryStatus;
  /** Tối đa 500 ký tự. */
  reason?: string;
}

/** Cùng dạng với `process`: HTTP 200, lỗi từng đơn nằm ở `results[i]`. */
export type SalesOrderBatchResponse = ProcessSalesOrdersResponse;
