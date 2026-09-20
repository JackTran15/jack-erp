import { mockDelay } from "./mockDelay";

/**
 * Dữ liệu mock của trang Đơn hàng.
 *
 * Backend chưa có domain đơn hàng: 12/27 cột của màn hình (giao hàng, vận
 * chuyển, sàn, đối soát, nhãn) không tồn tại ở `apps/api`. Trang dựng trên mock
 * theo đúng tiền lệ trang Tổng quan; khi BE sẵn sàng thì thay `_mock/` bằng
 * `_api/`, phần còn lại của trang không phải đổi.
 *
 * Bốn dòng dưới đây lấy nguyên từ ảnh chụp trong spec để tổng ở summary row
 * khớp số thật: tổng thanh toán 25.080.000, đặt cọc 1.000.000, khách nợ
 * 2.600.000.
 */

/** Ngày lưu dạng ISO `YYYY-MM-DD` để so sánh/lọc; hiển thị mới đổi sang DD/MM/YYYY. */
export interface OrderRow {
  id: string;
  createdDate: string;
  deliveryDate: string;
  invoiceDate: string;
  paymentStatus: string;
  orderType: string;
  invoiceCode: string;
  salesStaff: string;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  shippingFeeCustomer: number;
  shippingPartner: string;
  carrierStatus: string;
  trackingCode: string;
  marketplaceOrderCode: string;
  totalAmount: number;
  deposit: number;
  customerDebt: number;
  remainingReceivable: number;
  cod: string;
  packageInfo: string;
  shippingFeePartner: number;
  salesChannel: string;
  note: string;
  reconciliationSlip: string;
  reconciliationStatus: string;
  tags: string[];
}

export interface OrderLineRow {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export const RECONCILIATION_PENDING = "Chưa đối soát";
export const RECONCILIATION_DONE = "Đã đối soát";

const PACKAGE_INFO_PLACEHOLDER = "300 (g)\nDàixRộngxCao (cm)";

/**
 * Mutable: nút "Đối soát" ghi ngược trạng thái vào đây, và tab "Nhãn" sửa
 * `tags`. Đây là chỗ thay cho một bảng thật, nên nó giữ dữ liệu giữa các lần
 * query — khác với state UI vốn nằm ở store.
 */
const ORDER_ROWS: OrderRow[] = [
  {
    id: "2606030001",
    createdDate: "2026-06-16",
    deliveryDate: "",
    invoiceDate: "",
    paymentStatus: "Chưa thanh toán",
    orderType: "Đặt hàng",
    invoiceCode: "2606030001",
    salesStaff: "",
    recipientName: "",
    recipientPhone: "",
    shippingAddress: "",
    shippingFeeCustomer: 0,
    shippingPartner: "",
    carrierStatus: "",
    trackingCode: "",
    marketplaceOrderCode: "",
    totalAmount: 7_800_000,
    deposit: 500_000,
    customerDebt: 300_000,
    remainingReceivable: 0,
    cod: "",
    packageInfo: PACKAGE_INFO_PLACEHOLDER,
    shippingFeePartner: 0,
    salesChannel: "Tại cửa hàng",
    note: "GHI CHU SAU CUNG",
    reconciliationSlip: "",
    reconciliationStatus: RECONCILIATION_PENDING,
    tags: ["Priority"],
  },
  {
    id: "2606030002",
    createdDate: "2026-06-16",
    deliveryDate: "",
    invoiceDate: "",
    paymentStatus: "Chưa thanh toán",
    orderType: "Đặt hàng",
    invoiceCode: "2606030002",
    salesStaff: "",
    recipientName: "",
    recipientPhone: "",
    shippingAddress: "",
    shippingFeeCustomer: 0,
    shippingPartner: "",
    carrierStatus: "",
    trackingCode: "",
    marketplaceOrderCode: "",
    totalAmount: 14_400_000,
    deposit: 0,
    customerDebt: 2_000_000,
    remainingReceivable: 0,
    cod: "",
    packageInfo: PACKAGE_INFO_PLACEHOLDER,
    shippingFeePartner: 0,
    salesChannel: "Tại cửa hàng",
    note: "Don hang Test",
    reconciliationSlip: "",
    reconciliationStatus: RECONCILIATION_PENDING,
    tags: ["Priority"],
  },
  {
    id: "2606030003",
    createdDate: "2026-06-16",
    deliveryDate: "",
    invoiceDate: "2026-06-16",
    paymentStatus: "",
    orderType: "Đặt hàng",
    invoiceCode: "2606030003",
    salesStaff: "",
    recipientName: "",
    recipientPhone: "",
    shippingAddress: "",
    shippingFeeCustomer: 0,
    shippingPartner: "",
    carrierStatus: "",
    trackingCode: "",
    marketplaceOrderCode: "",
    totalAmount: 1_440_000,
    deposit: 0,
    customerDebt: 200_000,
    remainingReceivable: 0,
    cod: "",
    packageInfo: PACKAGE_INFO_PLACEHOLDER,
    shippingFeePartner: 0,
    salesChannel: "Tại cửa hàng",
    note: "",
    reconciliationSlip: "",
    reconciliationStatus: RECONCILIATION_PENDING,
    tags: ["Priority"],
  },
  {
    id: "2606030004",
    createdDate: "2026-06-16",
    deliveryDate: "",
    invoiceDate: "2026-06-16",
    paymentStatus: "",
    orderType: "Đặt hàng",
    invoiceCode: "2606030004",
    salesStaff: "",
    recipientName: "",
    recipientPhone: "",
    shippingAddress: "",
    shippingFeeCustomer: 0,
    shippingPartner: "",
    carrierStatus: "",
    trackingCode: "",
    marketplaceOrderCode: "",
    totalAmount: 1_440_000,
    deposit: 500_000,
    customerDebt: 100_000,
    remainingReceivable: 0,
    cod: "",
    packageInfo: PACKAGE_INFO_PLACEHOLDER,
    shippingFeePartner: 0,
    salesChannel: "Tại cửa hàng",
    note: "",
    reconciliationSlip: "",
    reconciliationStatus: RECONCILIATION_PENDING,
    tags: ["Priority"],
  },
];

/** 10 dòng × 780.000 = 7.800.000, khớp "Tổng thanh toán" của đơn 2606030001. */
const SHOE_SIZES = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45];

const ORDER_LINES: Record<string, OrderLineRow[]> = {
  "2606030001": SHOE_SIZES.map((size) => ({
    sku: `AKU2201-TR-${size}`,
    name: `Giày thể thao AKU2201-TR-${size}`,
    unit: "Đôi",
    quantity: 1,
    unitPrice: 780_000,
    amount: 780_000,
  })),
  "2606030002": SHOE_SIZES.slice(0, 8).map((size) => ({
    sku: `AKU3100-BK-${size}`,
    name: `Giày chạy bộ AKU3100-BK-${size}`,
    unit: "Đôi",
    quantity: 1,
    unitPrice: 1_800_000,
    amount: 1_800_000,
  })),
  "2606030003": [
    {
      sku: "AKU1050-WH-39",
      name: "Giày sneaker AKU1050-WH-39",
      unit: "Đôi",
      quantity: 2,
      unitPrice: 720_000,
      amount: 1_440_000,
    },
  ],
  "2606030004": [
    {
      sku: "AKU1050-WH-40",
      name: "Giày sneaker AKU1050-WH-40",
      unit: "Đôi",
      quantity: 2,
      unitPrice: 720_000,
      amount: 1_440_000,
    },
  ],
};

export function getOrderRows(): OrderRow[] {
  return ORDER_ROWS;
}

export function fetchOrderLines(orderId: string | null): Promise<OrderLineRow[]> {
  if (!orderId) return mockDelay([]);
  return mockDelay(ORDER_LINES[orderId] ?? []);
}

/**
 * Đánh dấu đối soát cho các đơn đã tick và cấp mã phiếu. Ghi thẳng vào mảng mock
 * (chỗ thay cho một lệnh UPDATE), rồi trang invalidate query để đọc lại.
 */
export function reconcileOrders(orderIds: string[]): void {
  const slip = `DS${Date.now().toString().slice(-8)}`;
  for (const row of ORDER_ROWS) {
    if (!orderIds.includes(row.id)) continue;
    row.reconciliationStatus = RECONCILIATION_DONE;
    row.reconciliationSlip = slip;
  }
}

export function setOrderTags(orderId: string, tags: string[]): void {
  const row = ORDER_ROWS.find((item) => item.id === orderId);
  if (row) row.tags = tags;
}
