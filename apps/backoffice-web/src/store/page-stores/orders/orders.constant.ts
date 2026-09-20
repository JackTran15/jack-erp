import type { OrderDateField } from "../../../pages/orders/_lib/order-filter";

export const ORDER_DATE_FIELD_OPTIONS: { value: OrderDateField; label: string }[] = [
  { value: "createdDate", label: "Ngày tạo đơn" },
  { value: "deliveryDate", label: "Ngày giao hàng" },
  { value: "invoiceDate", label: "Ngày hóa đơn" },
];

/** Tập nhãn có thể gắn cho đơn. Thay bằng API khi backend có bảng nhãn. */
export const ORDER_TAGS = ["Priority", "Giao gấp", "Đã liên hệ", "Chờ thanh toán"];

export const ORDERS_DEFAULT_PAGE_SIZE = 50;

export const ORDERS_STORE_KEY = "bo-orders-page";
