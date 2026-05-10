/**
 * Static fixtures for the Xuất kho (Goods Issues) page.
 * Used while the backend list/lines endpoint isn't returning seeded data so
 * the UI (master table + bottom detail panel + view dialog) has realistic
 * content to render. Replace with the live API once it returns data.
 * Remove this file when the UI is wired to the real backend.
 */

export type MockGoodsIssueStatus =
  | "DRAFT"
  | "APPROVED"
  | "POSTED"
  | "CANCELLED";

export interface MockGoodsIssueLine {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  warehouse: string;
  position: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface MockGoodsIssue {
  id: string;
  documentNumber?: string;
  customerId: string;
  customerName: string;
  locationId: string;
  status: MockGoodsIssueStatus;
  issueDate?: string;
  reason?: string;
  notes?: string;
  documentType: string;
  approvedBy?: string;
  approvedAt?: string;
  postedBy?: string;
  postedAt?: string;
  lines: MockGoodsIssueLine[];
  createdAt: string;
}

const CUSTOMER_DEFAULT_ID = "65000000-0000-4000-8000-0000000000a1";
const LOCATION_MAIN_ID = "60000000-0000-4000-8000-000000000001";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

export const MOCK_GOODS_ISSUES: MockGoodsIssue[] = [
  {
    id: "C0000000-0000-4000-8000-000000000001",
    documentNumber: "XK000004",
    customerId: CUSTOMER_DEFAULT_ID,
    customerName: "Phan Thanh Hà",
    locationId: LOCATION_MAIN_ID,
    status: "POSTED",
    issueDate: dateDaysAgo(5),
    notes: "Xuất kho bán hàng theo hóa đơn số 2605010001",
    documentType: "Phiếu xuất kho bán hàng",
    postedBy: "Inventory Admin",
    postedAt: isoDaysAgo(5),
    createdAt: isoDaysAgo(5),
    lines: [
      {
        id: "GL01",
        itemId: "A3000000-0000-4000-8000-000000000010",
        itemCode: "MY3007-D-35",
        itemName: "Dép nữ MY3007-D-35",
        warehouse: "SHOWROOM CẦN THƠ",
        position: "B-02",
        unit: "Đôi",
        quantity: 1,
        unitPrice: 0,
      },
      {
        id: "GL02",
        itemId: "A3000000-0000-4000-8000-000000000011",
        itemCode: "AKCV19837-D-41",
        itemName: "Giày nam AKCV19837-D-41",
        warehouse: "SHOWROOM CẦN THƠ",
        position: "B-02",
        unit: "Đôi",
        quantity: 1,
        unitPrice: 0,
      },
    ],
  },
  {
    id: "C0000000-0000-4000-8000-000000000002",
    documentNumber: "XK000005",
    customerId: CUSTOMER_DEFAULT_ID,
    customerName: "Anh Hà",
    locationId: LOCATION_MAIN_ID,
    status: "POSTED",
    issueDate: dateDaysAgo(5),
    notes: "Xuất kho bán hàng theo hóa đơn số 2604010001",
    documentType: "Phiếu xuất kho bán hàng",
    postedBy: "Inventory Admin",
    postedAt: isoDaysAgo(5),
    createdAt: isoDaysAgo(5),
    lines: [
      {
        id: "GL03",
        itemId: "A3000000-0000-4000-8000-000000000004",
        itemCode: "GELLI-40-DEN",
        itemName: "Giày Gelli (40 · Đen)",
        warehouse: "SHOWROOM CẦN THƠ",
        position: "A-01",
        unit: "Đôi",
        quantity: 1,
        unitPrice: 0,
      },
    ],
  },
  {
    id: "C0000000-0000-4000-8000-000000000003",
    documentNumber: "XK000008",
    customerId: CUSTOMER_DEFAULT_ID,
    customerName: "duc anh",
    locationId: LOCATION_MAIN_ID,
    status: "POSTED",
    issueDate: dateDaysAgo(5),
    notes: "Xuất kho bán hàng theo hóa đơn số 2605010002",
    documentType: "Phiếu xuất kho bán hàng",
    postedBy: "Inventory Admin",
    postedAt: isoDaysAgo(5),
    createdAt: isoDaysAgo(5),
    lines: [
      {
        id: "GL04",
        itemId: "A3000000-0000-4000-8000-000000000001",
        itemCode: "GELLI-39-NAU",
        itemName: "Giày Gelli (39 · Nâu)",
        warehouse: "SHOWROOM CẦN THƠ",
        position: "A-01",
        unit: "Đôi",
        quantity: 2,
        unitPrice: 0,
      },
    ],
  },
  {
    id: "C0000000-0000-4000-8000-000000000004",
    documentNumber: "XK000011",
    customerId: CUSTOMER_DEFAULT_ID,
    customerName: "Phan Thanh Hà",
    locationId: LOCATION_MAIN_ID,
    status: "POSTED",
    issueDate: dateDaysAgo(5),
    notes: "Xuất kho bán hàng theo hóa đơn số 2605010007",
    documentType: "Phiếu xuất kho bán hàng",
    postedBy: "Inventory Admin",
    postedAt: isoDaysAgo(5),
    createdAt: isoDaysAgo(5),
    lines: [
      {
        id: "GL05",
        itemId: "A3000000-0000-4000-8000-000000000005",
        itemCode: "GELLI-43-NAU",
        itemName: "Giày Gelli (43 · Nâu)",
        warehouse: "SHOWROOM CẦN THƠ",
        position: "A-01",
        unit: "Đôi",
        quantity: 1,
        unitPrice: 345_000,
      },
    ],
  },
  {
    id: "C0000000-0000-4000-8000-000000000005",
    documentNumber: "XK000012",
    customerId: CUSTOMER_DEFAULT_ID,
    customerName: "Phan Thanh Hà",
    locationId: LOCATION_MAIN_ID,
    status: "POSTED",
    issueDate: dateDaysAgo(4),
    notes: "Xuất kho bán hàng theo hóa đơn số 2605010008",
    documentType: "Phiếu xuất kho bán hàng",
    postedBy: "Inventory Admin",
    postedAt: isoDaysAgo(4),
    createdAt: isoDaysAgo(4),
    lines: [
      {
        id: "GL06",
        itemId: "A3000000-0000-4000-8000-000000000004",
        itemCode: "GELLI-40-DEN",
        itemName: "Giày Gelli (40 · Đen)",
        warehouse: "SHOWROOM CẦN THƠ",
        position: "A-01",
        unit: "Đôi",
        quantity: 1,
        unitPrice: 345_000,
      },
    ],
  },
  {
    id: "C0000000-0000-4000-8000-000000000006",
    documentNumber: "XK000017",
    customerId: CUSTOMER_DEFAULT_ID,
    customerName: "Phan Thanh Hà",
    locationId: LOCATION_MAIN_ID,
    status: "APPROVED",
    issueDate: dateDaysAgo(2),
    notes: "Xuất kho bán hàng theo hóa đơn số 2605010015",
    documentType: "Phiếu xuất kho bán hàng",
    approvedBy: "Inventory Admin",
    approvedAt: isoDaysAgo(2),
    createdAt: isoDaysAgo(2),
    lines: [
      {
        id: "GL07",
        itemId: "A3000000-0000-4000-8000-000000000005",
        itemCode: "GELLI-43-NAU",
        itemName: "Giày Gelli (43 · Nâu)",
        warehouse: "SHOWROOM CẦN THƠ",
        position: "A-01",
        unit: "Đôi",
        quantity: 1,
        unitPrice: 0,
      },
    ],
  },
  {
    id: "C0000000-0000-4000-8000-000000000007",
    documentNumber: undefined,
    customerId: CUSTOMER_DEFAULT_ID,
    customerName: "Khách lẻ",
    locationId: LOCATION_MAIN_ID,
    status: "DRAFT",
    issueDate: dateDaysAgo(0),
    notes: "Phiếu nháp - chờ duyệt",
    documentType: "Phiếu xuất kho khác",
    createdAt: isoDaysAgo(0),
    lines: [
      {
        id: "GL08",
        itemId: "A3000000-0000-4000-8000-000000000001",
        itemCode: "GELLI-39-NAU",
        itemName: "Giày Gelli (39 · Nâu)",
        warehouse: "KHO CHÍNH",
        position: "A-01",
        unit: "Đôi",
        quantity: 3,
        unitPrice: 420_000,
        notes: "Xuất mẫu",
      },
    ],
  },
];
