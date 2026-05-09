/**
 * Static fixtures for the Nhập kho (Purchase Orders) page.
 * Used while the backend list/lines endpoint isn't returning seeded data so
 * the UI (master table + bottom detail panel + view dialog) has realistic
 * content to render. Replace with the live API once it returns data.
 * Remove this file when the UI is wired to the real backend.
 */

export type MockPurchaseOrderStatus =
  | "DRAFT"
  | "APPROVED"
  | "RECEIVING"
  | "RECEIVED"
  | "CANCELLED";

export interface MockPurchaseOrderLine {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  warehouse: string;
  position: string;
  unit: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
  notes?: string;
}

export interface MockPurchaseOrder {
  id: string;
  documentNumber?: string;
  providerId: string;
  providerName: string;
  locationId: string;
  status: MockPurchaseOrderStatus;
  expectedDate?: string;
  notes?: string;
  reason?: string;
  documentType: string;
  approvedBy?: string;
  approvedAt?: string;
  lines: MockPurchaseOrderLine[];
  createdAt: string;
}

const PROVIDER_DEFAULT_ID = "65000000-0000-4000-8000-000000000001";
const LOCATION_MAIN_ID = "60000000-0000-4000-8000-000000000001";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

export const MOCK_PURCHASE_ORDERS: MockPurchaseOrder[] = [
  {
    id: "B0000000-0000-4000-8000-000000000001",
    documentNumber: undefined,
    providerId: PROVIDER_DEFAULT_ID,
    providerName: "Default Supplier",
    locationId: LOCATION_MAIN_ID,
    status: "DRAFT",
    expectedDate: dateDaysAgo(2),
    notes: "Phiếu nháp đang chuẩn bị",
    documentType: "Phiếu nhập kho khác",
    createdAt: isoDaysAgo(2),
    lines: [
      {
        id: "L01",
        itemId: "70000000-0000-4000-8000-000000000001",
        itemCode: "LAPTOP-15",
        itemName: "Laptop 15 inch",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "pcs",
        orderedQuantity: 10,
        receivedQuantity: 0,
        unitPrice: 18_500_000,
        notes: "Laptop demo nháp",
      },
      {
        id: "L02",
        itemId: "70000000-0000-4000-8000-000000000002",
        itemCode: "MONITOR-24",
        itemName: "Màn hình 24 inch",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "pcs",
        orderedQuantity: 5,
        receivedQuantity: 0,
        unitPrice: 5_200_000,
      },
    ],
  },
  {
    id: "B0000000-0000-4000-8000-000000000002",
    documentNumber: "NK000001",
    providerId: PROVIDER_DEFAULT_ID,
    providerName: "Default Supplier",
    locationId: LOCATION_MAIN_ID,
    status: "APPROVED",
    expectedDate: dateDaysAgo(5),
    notes: "Đặt hàng nhập kho định kỳ",
    documentType: "Phiếu nhập kho khác",
    approvedBy: "Inventory Admin",
    approvedAt: isoDaysAgo(4),
    createdAt: isoDaysAgo(5),
    lines: [
      {
        id: "L03",
        itemId: "A3000000-0000-4000-8000-000000000001",
        itemCode: "GELLI-39-NAU",
        itemName: "Giày Gelli (39 · Nâu)",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "đôi",
        orderedQuantity: 50,
        receivedQuantity: 0,
        unitPrice: 420_000,
      },
      {
        id: "L04",
        itemId: "A3000000-0000-4000-8000-000000000004",
        itemCode: "GELLI-40-DEN",
        itemName: "Giày Gelli (40 · Đen)",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "đôi",
        orderedQuantity: 30,
        receivedQuantity: 0,
        unitPrice: 420_000,
      },
      {
        id: "L05",
        itemId: "A3000000-0000-4000-8000-000000000005",
        itemCode: "GELLI-43-NAU",
        itemName: "Giày Gelli (43 · Nâu)",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "đôi",
        orderedQuantity: 25,
        receivedQuantity: 0,
        unitPrice: 420_000,
      },
    ],
  },
  {
    id: "B0000000-0000-4000-8000-000000000003",
    documentNumber: "NK000002",
    providerId: PROVIDER_DEFAULT_ID,
    providerName: "Default Supplier",
    locationId: LOCATION_MAIN_ID,
    status: "RECEIVING",
    expectedDate: dateDaysAgo(7),
    notes: "Đơn hàng đang nhận từng phần",
    documentType: "Phiếu nhập kho khác",
    approvedBy: "Inventory Admin",
    approvedAt: isoDaysAgo(6),
    createdAt: isoDaysAgo(7),
    lines: [
      {
        id: "L06",
        itemId: "70000000-0000-4000-8000-000000000001",
        itemCode: "LAPTOP-15",
        itemName: "Laptop 15 inch",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "pcs",
        orderedQuantity: 8,
        receivedQuantity: 5,
        unitPrice: 18_500_000,
        notes: "Đã nhận 5/8",
      },
      {
        id: "L07",
        itemId: "A3000000-0000-4000-8000-000000000001",
        itemCode: "GELLI-39-NAU",
        itemName: "Giày Gelli (39 · Nâu)",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "đôi",
        orderedQuantity: 60,
        receivedQuantity: 40,
        unitPrice: 420_000,
        notes: "Đã nhận 40/60",
      },
    ],
  },
  {
    id: "B0000000-0000-4000-8000-000000000004",
    documentNumber: "NK000003",
    providerId: PROVIDER_DEFAULT_ID,
    providerName: "Default Supplier",
    locationId: LOCATION_MAIN_ID,
    status: "RECEIVED",
    expectedDate: dateDaysAgo(14),
    notes: "Phiếu đã hoàn tất",
    documentType: "Phiếu nhập kho khác",
    approvedBy: "Inventory Admin",
    approvedAt: isoDaysAgo(13),
    createdAt: isoDaysAgo(14),
    lines: [
      {
        id: "L08",
        itemId: "A3000000-0000-4000-8000-000000000004",
        itemCode: "GELLI-40-DEN",
        itemName: "Giày Gelli (40 · Đen)",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "đôi",
        orderedQuantity: 20,
        receivedQuantity: 20,
        unitPrice: 420_000,
        notes: "Hoàn tất giao",
      },
      {
        id: "L09",
        itemId: "A3000000-0000-4000-8000-000000000005",
        itemCode: "GELLI-43-NAU",
        itemName: "Giày Gelli (43 · Nâu)",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "đôi",
        orderedQuantity: 15,
        receivedQuantity: 15,
        unitPrice: 420_000,
        notes: "Hoàn tất giao",
      },
    ],
  },
];
