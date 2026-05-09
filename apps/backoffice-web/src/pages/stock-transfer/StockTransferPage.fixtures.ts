/**
 * Static fixtures for the Stock Transfer page. Replaced by API calls when the
 * UI is wired to the real backend.
 * Remove this file when the UI is wired to the real backend.
 */

export type StockTransferStatus = "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

export interface MockStorage {
  id: string;
  code: string;
  name: string;
}

export interface MockLocation {
  id: string;
  code: string;
  name: string;
  storageId: string;
}

export interface MockItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  defaultPrice: number;
}

export interface MockEmployee {
  id: string;
  code: string;
  name: string;
}

export interface StockTransferLine {
  id: string;
  itemId: string;
  sku: string;
  itemName: string;
  sourceStorageId: string;
  sourceLocationId?: string;
  destinationStorageId: string;
  destinationLocationId?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface StockTransfer {
  id: string;
  documentNumber: string;
  date: string;
  transporterId: string;
  notes?: string;
  status: StockTransferStatus;
  lines: StockTransferLine[];
}

export const MOCK_STORAGES: MockStorage[] = [
  { id: "storage-ct", code: "KCT", name: "KHO CẦN THƠ" },
  { id: "storage-hcm", code: "KHCM", name: "KHO HỒ CHÍ MINH" },
  { id: "storage-hn", code: "KHN", name: "KHO HÀ NỘI" },
];

export const MOCK_LOCATIONS: MockLocation[] = [
  { id: "loc-a01-01", code: "A01.01", name: "A01.01", storageId: "storage-ct" },
  { id: "loc-a01-02", code: "A01.02", name: "A01.02", storageId: "storage-ct" },
  { id: "loc-a02-04", code: "A02.04", name: "A02.04", storageId: "storage-ct" },
  { id: "loc-b03-01", code: "B03.01", name: "B03.01", storageId: "storage-hcm" },
  { id: "loc-b03-02", code: "B03.02", name: "B03.02", storageId: "storage-hcm" },
  { id: "loc-c01-01", code: "C01.01", name: "C01.01", storageId: "storage-hn" },
];

export const MOCK_ITEMS: MockItem[] = [
  { id: "item-001", sku: "GMT-001", name: "Giày MT thể thao đen size 40", unit: "Đôi", defaultPrice: 450000 },
  { id: "item-002", sku: "GMT-002", name: "Giày MT cao gót nâu size 36", unit: "Đôi", defaultPrice: 620000 },
  { id: "item-003", sku: "GMT-003", name: "Giày MT lười da bò size 42", unit: "Đôi", defaultPrice: 780000 },
  { id: "item-004", sku: "GMT-004", name: "Giày MT trẻ em size 28", unit: "Đôi", defaultPrice: 280000 },
  { id: "item-005", sku: "GMT-005", name: "Dép MT quai ngang size 40", unit: "Đôi", defaultPrice: 180000 },
];

export const MOCK_EMPLOYEES: MockEmployee[] = [
  { id: "emp-0000", code: "0000", name: "Phan Thanh Hà" },
  { id: "emp-0001", code: "0001", name: "Nguyễn Văn An" },
  { id: "emp-0002", code: "0002", name: "Trần Thị Bích" },
  { id: "emp-0003", code: "0003", name: "Lê Hoàng Nam" },
];

export const MOCK_STOCK_TRANSFERS: StockTransfer[] = [
  {
    id: "txfr-001",
    documentNumber: "CK000001",
    date: "2026-05-03",
    transporterId: "emp-0000",
    notes: "Điều chuyển nội bộ giữa kho",
    status: "POSTED",
    lines: [
      {
        id: "txfr-001-l1",
        itemId: "item-001",
        sku: "GMT-001",
        itemName: "Giày MT thể thao đen size 40",
        sourceStorageId: "storage-hcm",
        sourceLocationId: "loc-b03-01",
        destinationStorageId: "storage-ct",
        destinationLocationId: "loc-a01-01",
        unit: "Đôi",
        quantity: 25,
        unitPrice: 450000,
      },
      {
        id: "txfr-001-l2",
        itemId: "item-005",
        sku: "GMT-005",
        itemName: "Dép MT quai ngang size 40",
        sourceStorageId: "storage-hcm",
        sourceLocationId: "loc-b03-02",
        destinationStorageId: "storage-ct",
        destinationLocationId: "loc-a01-02",
        unit: "Đôi",
        quantity: 40,
        unitPrice: 180000,
      },
    ],
  },
  {
    id: "txfr-002",
    documentNumber: "CK000002",
    date: "2026-05-05",
    transporterId: "emp-0001",
    notes: "Bổ sung tồn kho cuối tuần",
    status: "APPROVED",
    lines: [
      {
        id: "txfr-002-l1",
        itemId: "item-002",
        sku: "GMT-002",
        itemName: "Giày MT cao gót nâu size 36",
        sourceStorageId: "storage-hn",
        sourceLocationId: "loc-c01-01",
        destinationStorageId: "storage-ct",
        destinationLocationId: "loc-a02-04",
        unit: "Đôi",
        quantity: 12,
        unitPrice: 620000,
      },
    ],
  },
  {
    id: "txfr-003",
    documentNumber: "CK000003",
    date: "2026-05-07",
    transporterId: "emp-0002",
    notes: "Chuyển hàng mẫu trưng bày",
    status: "DRAFT",
    lines: [
      {
        id: "txfr-003-l1",
        itemId: "item-003",
        sku: "GMT-003",
        itemName: "Giày MT lười da bò size 42",
        sourceStorageId: "storage-ct",
        sourceLocationId: "loc-a02-04",
        destinationStorageId: "storage-hcm",
        destinationLocationId: "loc-b03-01",
        unit: "Đôi",
        quantity: 6,
        unitPrice: 780000,
      },
    ],
  },
];

export function nextDocumentNumber(existing: StockTransfer[]): string {
  const max = existing
    .map((t) => Number.parseInt(t.documentNumber.replace(/\D/g, ""), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `CK${String(max + 1).padStart(6, "0")}`;
}

export function lineSubtotal(l: { quantity: number; unitPrice: number }): number {
  return Number(l.quantity || 0) * Number(l.unitPrice || 0);
}

export function transferTotal(t: StockTransfer): number {
  return t.lines.reduce((sum, l) => sum + lineSubtotal(l), 0);
}
