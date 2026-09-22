import type { OrderLineRow, OrderRow } from "../_mock/orders.mock";
import { formatOrderMoney } from "./order-format";

/**
 * Chỗ DUY NHẤT biết cả hai hình dạng: `SalesOrderView` của
 * `GET /mobile/sales-orders` và `OrderRow` mà lưới/bộ lọc/dialog cột đang dựa
 * vào. `OrderRow` là hợp đồng — ticket này chỉ đổi NGUỒN, không đổi hợp đồng.
 *
 * Mọi trường của DTO đều khai optional: hôm nay `SalesOrderView` chưa trả người
 * nhận, địa chỉ giao hay phí giao (xem ghi chú ở {@link SalesOrderDto}), và đơn
 * mobile thì vĩnh viễn không có mấy trường đó. Thiếu trường phải ra ô trống,
 * không được ra `undefined` chạy thẳng vào lưới.
 */

export type SalesOrderDtoStatus =
  | "DRAFT"
  | "SENT"
  | "PROCESSED"
  | "REJECTED"
  | "CANCELLED";

export interface SalesOrderLineDto {
  id?: string;
  /** Mã hàng — `SalesOrderLineView.code`, không phải `id`. */
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  lineTotal?: number | string | null;
}

/**
 * `SalesOrderView` (apps/api/src/modules/sales-order/sales-order.service.ts).
 *
 * Các trường đánh dấu "chưa có trong view" đã tồn tại trên `sales_orders` sau
 * migration của đợt này nhưng `toView()` chưa trả về. Khai sẵn ở đây để ngày
 * API trả thêm thì chỉ cần đọc — không phải sửa lưới.
 */
export interface SalesOrderDto {
  id: string;
  code?: string | null;
  status?: SalesOrderDtoStatus | string | null;
  /** ISO datetime. */
  createdAt?: string | null;
  salespersonName?: string | null;
  salesChannel?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  amountDue?: number | string | null;
  note?: string | null;
  /** Danh sách trả `null` (chỉ đường chi tiết mới tra mã hoá đơn). */
  invoiceCode?: string | null;
  lines?: SalesOrderLineDto[] | null;

  /** Chưa có trong view — `sales_orders.recipient_name`. */
  recipientName?: string | null;
  /** Chưa có trong view — `sales_orders.recipient_phone`. */
  recipientPhone?: string | null;
  /** Chưa có trong view — `sales_orders.ship_address_line`. */
  shipAddressLine?: string | null;
  /** Chưa có trong view — `sales_orders.ship_ward_name`. */
  shipWardName?: string | null;
  /** Chưa có trong view — `sales_orders.ship_province_name`. */
  shipProvinceName?: string | null;
  /** Chưa có trong view — `sales_orders.shipping_fee`. */
  shippingFee?: number | string | null;
}

/**
 * Nhãn cột "Trạng thái" = trạng thái ĐƠN, không phải trạng thái thanh toán:
 * tình trạng thanh toán nằm trên hoá đơn và `/mobile/sales-orders` không trả nó
 * về. Bịa "Đã thanh toán" từ một đơn `PROCESSED` là nói sai — đơn đã ra hoá đơn
 * nháp vẫn có thể còn nợ COD.
 */
const STATUS_LABELS: Partial<Record<string, string>> = {
  DRAFT: "Lưu tạm",
  SENT: "Chờ xử lý",
  PROCESSED: "Đã xử lý",
  REJECTED: "Từ chối",
  CANCELLED: "Đã huỷ",
};

/** Mọi đơn trong lưới này đều là đơn đặt hàng (A-18). */
const ORDER_TYPE_ORDER = "Đặt hàng";

function text(value: string | null | undefined): string {
  return value ?? "";
}

/** `numeric` của Postgres về JSON có thể là chuỗi — đừng tin nó luôn là số. */
function money(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * ISO datetime → `YYYY-MM-DD` theo giờ ĐỊA PHƯƠNG.
 *
 * Đây là KHOÁ để so sánh/lọc, không phải chuỗi hiển thị — phần hiển thị
 * `DD/MM/YYYY` do `formatOrderDate` lo. Cắt chuỗi bằng `slice(0, 10)` sẽ cho ra
 * ngày UTC: một đơn tạo lúc 00:30 giờ VN sẽ lùi về hôm trước.
 */
function toLocalIsoDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Địa chỉ giao là SNAPSHOT trên đơn (A-07): số nhà, phường, tỉnh. */
function joinShippingAddress(dto: SalesOrderDto): string {
  return [dto.shipAddressLine, dto.shipWardName, dto.shipProvinceName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

export function toOrderRow(dto: SalesOrderDto): OrderRow {
  const status = dto.status ?? "";
  const amountDue = money(dto.amountDue);

  return {
    id: dto.id,
    createdDate: toLocalIsoDate(dto.createdAt),
    // Vòng đời giao hàng không thuộc đợt này (A-12): không có ngày giao.
    deliveryDate: "",
    // Danh sách không tra hoá đơn (`toView` chỉ gắn mã ở đường chi tiết), nên
    // cả ngày lẫn mã hoá đơn đều để trống thay vì đoán.
    invoiceDate: "",
    paymentStatus: STATUS_LABELS[String(status)] ?? String(status),
    orderType: ORDER_TYPE_ORDER,
    invoiceCode: text(dto.invoiceCode),
    salesStaff: text(dto.salespersonName),
    // Đơn web có người nhận riêng; đơn mobile không, ở đó khách chính là người nhận.
    recipientName: text(dto.recipientName ?? dto.customerName),
    recipientPhone: text(dto.recipientPhone ?? dto.customerPhone),
    shippingAddress: joinShippingAddress(dto),
    shippingFeeCustomer: money(dto.shippingFee),
    // 8 cột vận chuyển/đối soát/sàn: chưa có backing, ẩn ở T-05-04.
    shippingPartner: "",
    carrierStatus: "",
    trackingCode: "",
    marketplaceOrderCode: "",
    totalAmount: amountDue,
    // Đặt cọc / công nợ nằm ở `invoice_debts`, ngoài phạm vi đợt này (A-12).
    deposit: 0,
    customerDebt: 0,
    remainingReceivable: 0,
    // "Thu hộ" = số shipper phải thu = `amount_due` (A-17), và `amount_due` đã
    // gồm phí giao từ T-04-02/T-05-01 — nên đây là con số shipper cầm về, không
    // phải một phép cộng tay. Trả SỐ THÔ: renderer `money` của cột lo định dạng
    // (T-05-04). Định dạng sẵn ở đây sẽ làm dòng tổng `summary: "sum"` cộng chuỗi.
    cod: amountDue,
    packageInfo: "",
    shippingFeePartner: 0,
    salesChannel: text(dto.salesChannel),
    note: text(dto.note),
    reconciliationSlip: "",
    reconciliationStatus: "",
    // Bảng nhãn chưa tồn tại ở backend; nhãn là thứ của mock.
    tags: [],
  };
}

/** Dòng hàng cho panel chi tiết — danh sách đã trả sẵn, không gọi thêm lượt nào. */
export function toOrderLineRows(dto: SalesOrderDto): OrderLineRow[] {
  return (dto.lines ?? []).map((line) => ({
    sku: text(line.code),
    name: text(line.name),
    unit: text(line.unit),
    quantity: money(line.quantity),
    unitPrice: money(line.unitPrice),
    amount: money(line.lineTotal),
  }));
}
