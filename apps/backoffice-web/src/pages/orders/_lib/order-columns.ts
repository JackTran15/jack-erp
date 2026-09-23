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
  /**
   * Cột CHỈ có nghĩa ở lưới cấp tổ chức (`/orders/all`).
   *
   * Nó bị loại khỏi `ORDER_COLUMN_ORDER` — tức khỏi tập cột mặc định mà store
   * dựng lên cho `/orders` và `/orders/dispatch`, và khỏi cả dialog "Cài đặt
   * cột". Hỏi "chi nhánh nào đang giữ đơn" ở một lưới mà MỌI dòng đều thuộc
   * đúng một chi nhánh là một cột hằng số.
   */
  orgOnly?: boolean;
  /**
   * Cột CHƯA CÓ DỮ LIỆU THẬT — ẩn khỏi lưới và khỏi dialog "Cài đặt cột", nhưng
   * **cố ý giữ lại định nghĩa** (A-20).
   *
   * Ngày miền vận chuyển được làm, chỉ cần bỏ cờ này: bề rộng, bộ lọc, renderer
   * và nhãn tiếng Việt vẫn còn nguyên. Xoá hẳn khỏi `ORDER_COLUMNS` thì phải
   * dựng lại tất cả, và mọi cấu hình cột người dùng đã lưu có nhắc tới chúng sẽ
   * trỏ vào hư không.
   */
  hidden?: boolean;
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
 * Giá trị lọc của đơn CHƯA PHÂN — gửi thẳng lên `?branchId=`.
 *
 * Không phải chuỗi rỗng, và đó là một ràng buộc thật chứ không phải sở thích:
 * `GET /admin/sales-orders` từ chối `branchId=""` bằng 400, còn ô select trống
 * ("— Tất cả —") cũng là chuỗi rỗng. Một chữ `UNASSIGNED` tách hai ý đó ra.
 */
export const BRANCH_UNASSIGNED_FILTER = "UNASSIGNED";

/** Nhãn ô "Chi nhánh" của đơn còn nằm trong pool điều phối. */
export const BRANCH_UNASSIGNED_LABEL = "(Chưa phân)";

/**
 * Nhãn khi đơn CÓ `branchId` nhưng chi nhánh đã bị xoá (server trả
 * `branchName: null`). Ô trống ở đây đọc y như đơn chưa phân — hai chuyện khác
 * hẳn nhau, và đơn này thì không bao giờ quay lại pool.
 */
export const BRANCH_DELETED_LABEL = "(Chi nhánh đã xoá)";

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
  // Tuỳ chọn lọc là danh sách chi nhánh thật, nên `filterOptions` được bơm lúc
  // dựng cột ở `/orders/all` chứ không khai cứng được ở đây.
  { key: "branchName", header: "Chi nhánh", width: 160, filterKind: "select", renderer: "text", orgOnly: true },
  { key: "salesStaff", header: "NV bán hàng", width: 144, filterKind: "symbol", renderer: "text" },
  { key: "recipientName", header: "Người nhận", width: 180, filterKind: "symbol", renderer: "text" },
  { key: "recipientPhone", header: "SĐT người nhận", width: 108, filterKind: "symbol", renderer: "text" },
  { key: "shippingAddress", header: "Địa chỉ giao hàng", width: 268, filterKind: "symbol", renderer: "multiline" },
  { key: "shippingFeeCustomer", header: "Phí GH thu khách", width: 144, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { hidden: true, key: "shippingPartner", header: "ĐT giao hàng", width: 144, filterKind: "symbol", renderer: "text" },
  { hidden: true, key: "carrierStatus", header: "Trạng thái ĐVVC", width: 180, filterKind: "symbol", renderer: "text" },
  { hidden: true, key: "trackingCode", header: "Mã vận đơn", width: 108, filterKind: "symbol", renderer: "text" },
  { hidden: true, key: "marketplaceOrderCode", header: "Mã đơn hàng trên sàn", width: 136, filterKind: "symbol", renderer: "text" },
  { key: "totalAmount", header: "Tổng thanh toán", width: 124, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "deposit", header: "Đặt cọc", width: 108, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "customerDebt", header: "Khách nợ", width: 108, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "remainingReceivable", header: "Còn phải thu", width: 108, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "cod", header: "Thu hộ", width: 120, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { hidden: true, key: "packageInfo", header: "Thông tin gói hàng", width: 164, filterKind: "symbol", renderer: "multiline" },
  { hidden: true, key: "shippingFeePartner", header: "Phí GH trả ĐT", width: 144, align: "right", filterKind: "number-range", renderer: "money", summary: "sum" },
  { key: "salesChannel", header: "Kênh bán hàng", width: 144, filterKind: "symbol", renderer: "text" },
  { key: "note", header: "Ghi chú", width: 180, filterKind: "symbol", renderer: "text" },
  { hidden: true, key: "reconciliationSlip", header: "Phiếu đối soát", width: 144, filterKind: "symbol", renderer: "text" },
  { hidden: true, key: "reconciliationStatus", header: "Trạng thái đối soát", width: 152, filterKind: "select", filterOptions: RECONCILIATION_OPTIONS, renderer: "text" },
  { key: "tags", header: "Nhãn (Tags)", width: 136, filterKind: "none", renderer: "tags" },
];

export const ORDER_COLUMN_BY_KEY = new Map<OrderColumnKey, OrderColumnDef>(
  ORDER_COLUMNS.map((column) => [column.key, column]),
);

/**
 * Thứ tự cột MẶC ĐỊNH của lưới đơn hàng cấp chi nhánh.
 *
 * Store dựng `columns.order` từ đây (và `merge` cũng lọc theo đây), nên cột
 * `orgOnly` không lọt vào `/orders` hay `/orders/dispatch` — kể cả với người
 * dùng đã lưu thiết lập cột từ trước. Lưới cấp tổ chức dùng
 * {@link ORDERS_ALL_COLUMN_ORDER}.
 */
export const ORDER_COLUMN_ORDER: OrderColumnKey[] = ORDER_COLUMNS.filter(
  (c) => !c.orgOnly && !c.hidden,
).map((c) => c.key);

/** Mọi khoá cột, kể cả cột chỉ dành cho lưới cấp tổ chức (`/orders/all`). */
export const ORDERS_ALL_COLUMN_ORDER: OrderColumnKey[] = ORDER_COLUMNS.filter(
  (c) => !c.hidden,
).map(
  (c) => c.key,
);

export const ORDER_FROZEN_KEYS: OrderColumnKey[] = ORDER_COLUMNS.filter(
  (c) => c.defaultFrozen,
).map((c) => c.key);

/** Các cột tiền được cộng ở summary row. */
export const ORDER_SUMMARY_KEYS: OrderColumnKey[] = ORDER_COLUMNS.filter(
  (c) => c.summary === "sum",
).map((c) => c.key);
