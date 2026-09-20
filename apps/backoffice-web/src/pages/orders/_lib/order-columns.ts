import type {
  ColumnFilterKind,
  ColumnFilterSelectOption,
} from "../../../components/table/BaseDataTable";
import type { OrderRow } from "../_mock/orders.mock";
import { RECONCILIATION_DONE, RECONCILIATION_PENDING } from "../_mock/orders.mock";

/** Kiểu ô của cột — quyết định cả cách render lẫn cách lọc. */
export type OrderCellRenderer =
  | "text"
  | "date"
  | "money"
  | "statusLink"
  | "invoiceLink"
  | "multiline"
  | "tags";

export interface OrderColumnDef {
  key: OrderColumnKey;
  header: string;
  width: number;
  align?: "left" | "right" | "center";
  filterKind: ColumnFilterKind;
  filterOptions?: ColumnFilterSelectOption[];
  renderer: OrderCellRenderer;
  /** Cột được cộng ở summary row dưới đáy lưới. */
  summary?: "sum";
  /** Ghim trái theo mặc định (7 cột đầu của spec, tính cả ô checkbox). */
  defaultFrozen?: boolean;
}

/** Mọi khoá cột đều là trường của `OrderRow` trừ `id`. */
export type OrderColumnKey = Exclude<keyof OrderRow, "id">;

const toOptions = (values: string[]): ColumnFilterSelectOption[] =>
  values.map((value) => ({ value, label: value }));

const PAYMENT_STATUS_OPTIONS = toOptions(["Chưa thanh toán", "Đã thanh toán"]);
const ORDER_TYPE_OPTIONS = toOptions(["Đặt hàng", "Bán lẻ", "Trả hàng"]);
const COD_OPTIONS = toOptions(["Có", "Không"]);
const RECONCILIATION_OPTIONS = toOptions([RECONCILIATION_PENDING, RECONCILIATION_DONE]);

/**
 * Nguồn sự thật cho cả lưới lẫn dialog "Cài đặt cột" — thứ tự ở đây là thứ tự
 * mặc định, và `defaultFrozen` là tập cột ghim mặc định.
 *
 * Bề rộng lấy từ bảng cột trong spec (§4.3.2).
 */
export const ORDER_COLUMNS: OrderColumnDef[] = [
  { key: "createdDate", header: "Ngày tạo đơn", width: 116, align: "center", filterKind: "date-compare", renderer: "date", defaultFrozen: true },
  { key: "deliveryDate", header: "Ngày giao hàng", width: 144, align: "center", filterKind: "date-compare", renderer: "date", defaultFrozen: true },
  { key: "invoiceDate", header: "Ngày hóa đơn", width: 116, align: "center", filterKind: "date-compare", renderer: "date", defaultFrozen: true },
  { key: "paymentStatus", header: "Trạng thái", width: 144, filterKind: "select", filterOptions: PAYMENT_STATUS_OPTIONS, renderer: "statusLink", defaultFrozen: true },
  { key: "orderType", header: "Loại đơn", width: 108, filterKind: "select", filterOptions: ORDER_TYPE_OPTIONS, renderer: "text", defaultFrozen: true },
  { key: "invoiceCode", header: "Hóa đơn", width: 108, filterKind: "symbol", renderer: "invoiceLink", defaultFrozen: true },
  { key: "salesStaff", header: "NV bán hàng", width: 144, filterKind: "symbol", renderer: "text" },
  { key: "recipientName", header: "Người nhận", width: 180, filterKind: "symbol", renderer: "text" },
  { key: "recipientPhone", header: "SĐT người nhận", width: 108, filterKind: "symbol", renderer: "text" },
  { key: "shippingAddress", header: "Địa chỉ giao hàng", width: 268, filterKind: "symbol", renderer: "multiline" },
  { key: "shippingFeeCustomer", header: "Phí GH thu khách", width: 144, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "shippingPartner", header: "ĐT giao hàng", width: 144, filterKind: "symbol", renderer: "text" },
  { key: "carrierStatus", header: "Trạng thái ĐVVC", width: 180, filterKind: "symbol", renderer: "text" },
  { key: "trackingCode", header: "Mã vận đơn", width: 108, filterKind: "symbol", renderer: "text" },
  { key: "marketplaceOrderCode", header: "Mã đơn hàng trên sàn", width: 136, filterKind: "symbol", renderer: "text" },
  { key: "totalAmount", header: "Tổng thanh toán", width: 124, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "deposit", header: "Đặt cọc", width: 108, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "customerDebt", header: "Khách nợ", width: 108, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "remainingReceivable", header: "Còn phải thu", width: 108, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "cod", header: "Thu hộ", width: 72, filterKind: "select", filterOptions: COD_OPTIONS, renderer: "text" },
  { key: "packageInfo", header: "Thông tin gói hàng", width: 164, filterKind: "symbol", renderer: "multiline" },
  { key: "shippingFeePartner", header: "Phí GH trả ĐT", width: 144, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "salesChannel", header: "Kênh bán hàng", width: 144, filterKind: "symbol", renderer: "text" },
  { key: "note", header: "Ghi chú", width: 180, filterKind: "symbol", renderer: "text" },
  { key: "reconciliationSlip", header: "Phiếu đối soát", width: 144, filterKind: "symbol", renderer: "text" },
  { key: "reconciliationStatus", header: "Trạng thái đối soát", width: 152, filterKind: "select", filterOptions: RECONCILIATION_OPTIONS, renderer: "text" },
  { key: "tags", header: "Nhãn (Tags)", width: 136, filterKind: "none", renderer: "tags" },
];

export const ORDER_COLUMN_BY_KEY = new Map<OrderColumnKey, OrderColumnDef>(
  ORDER_COLUMNS.map((column) => [column.key, column]),
);

export const ORDER_COLUMN_ORDER: OrderColumnKey[] = ORDER_COLUMNS.map((c) => c.key);

export const ORDER_FROZEN_KEYS: OrderColumnKey[] = ORDER_COLUMNS.filter(
  (c) => c.defaultFrozen,
).map((c) => c.key);

/** Các cột tiền được cộng ở summary row. */
export const ORDER_SUMMARY_KEYS: OrderColumnKey[] = ORDER_COLUMNS.filter(
  (c) => c.summary === "sum",
).map((c) => c.key);
